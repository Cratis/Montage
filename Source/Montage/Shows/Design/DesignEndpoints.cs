// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Json;
using Cratis.AI.Conversations;
using Cratis.AI.Providers;
using Cratis.Chronicle.ReadModels;
using Microsoft.Extensions.AI;

namespace Montage.Shows.Design;

/// <summary>A design draft request. No production state is changed until the storyboard is saved.</summary>
/// <param name="ProviderId">The configured model provider.</param>
/// <param name="Prompt">Direction for the layout and choreography.</param>
/// <param name="Current">The current diagram, including any design-template tokens.</param>
/// <param name="References">Optional image data URLs as visual references, not executable SVG.</param>
public record DesignRequest(string ProviderId, string Prompt, JsonElement Current, string[]? References);

/// <summary>
/// Stateless design proposals and reusable design-template storage. Model work is bounded,
/// returns a draft for review, and never overwrites a show's plan or starts production.
/// </summary>
public static class DesignEndpoints
{
    const string SystemPrompt = """
        You are a motion designer. Return ONLY a JSON object describing an editable infographic,
        not code, a screenshot, HTML, CSS, or a video. Preserve factual labels and relationships.
        Plan clear visual hierarchy, reading order, restrained anticipation and comprehension holds.
        Use a 1600x900 SVG viewBox. Reserve y<140 for the headline and y>800 for branding.
        The infographic must express relationships: parallel rows, convergence hubs, branching trees,
        fan-out maps, swimlanes, not a generic list of cards. No overlapping boxes or clipped labels.
        Supported shape: { headline, template: "cratis"|"blueprint"|"editorial", effect:
        "draw"|"pen"|"wipe"|"pop"|"slide"|"fade", stagger: seconds, describe: choreography,
        design: {bg, fill, ink, accent, stroke: hex colours, radius: 0..40, pen: boolean},
        nodes: [{id, label, x, y, width, height, color: optional hex, at: local seconds,
        duration: seconds, effect: optional override}], edges: [{from: nodeId, to: nodeId,
        at: local seconds, duration: seconds, points: optional [[x,y],...] for explicit routing}] }.
        Give each box a stable ID. Trace outlines, then settle the fill and reveal the label;
        route connectors from source to target without crossing unrelated boxes. Stagger builds
        across 1..8 seconds and hold the complete layout. Use reusable design tokens for visual
        references. Images are inspiration: do not embed their pixels or invent URLs. If a
        reference is a GIF, do not claim to have analysed its temporal motion from a single image.
        Nodes and edges can be as expressive as needed within this geometry model. Do not
        imply support for arbitrary SVG filters, scripts, 3D, particles, or path morphing.
        """;

    /// <summary>Maps the design and template endpoints.</summary>
    /// <param name="app">The application.</param>
    /// <param name="workspace">The durable workspace.</param>
    public static void Map(WebApplication app, string workspace)
    {
        app.MapPost("/api/montage/design/draft", Draft);
        var folder = Path.Combine(workspace, "design-templates");
        Directory.CreateDirectory(folder);
        app.MapGet("/api/montage/design/templates", () =>
        {
            var templates = Directory.EnumerateFiles(folder, "*.json")
                .Select(path => JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(path))).ToArray();
            return Results.Json(templates);
        });
        app.MapPost("/api/montage/design/templates", async (JsonElement template) =>
        {
            if (template.ValueKind != JsonValueKind.Object || !template.TryGetProperty("name", out var name) || string.IsNullOrWhiteSpace(name.GetString()))
            {
                return Results.BadRequest(new { error = "A template needs a name." });
            }
            var id = Guid.NewGuid().ToString("N");
            await File.WriteAllTextAsync(Path.Combine(folder, $"{id}.json"), template.GetRawText());
            return Results.Ok(new { id });
        });
    }

    static async Task<IResult> Draft(DesignRequest request, IReadModels readModels, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromMinutes(2));
        try
        {
            if (string.IsNullOrWhiteSpace(request.ProviderId)) return Results.BadRequest(new { error = "Choose an AI provider." });
            var provider = await readModels.GetInstanceById<ConfiguredAIProvider>((EventSourceId)request.ProviderId).WaitAsync(timeout.Token);
            if (provider is null) return Results.BadRequest(new { error = "The AI provider no longer exists." });
            var modelId = AIChatClientFactory.ResolveModelId(provider.Type, provider.Model);
            var resolved = AIChatClientFactory.Create(provider.Type, provider.ApiKey, provider.Endpoint, modelId);
            if (resolved is null) return Results.BadRequest(new { error = "The provider cannot create a chat client." });
            var message = new ChatMessage(ChatRole.User, $"Direction: {request.Prompt}\nCurrent infographic: {request.Current.GetRawText()}");
            foreach (var reference in (request.References ?? []).Take(3))
            {
                var comma = reference.IndexOf(',');
                if (comma < 0 || reference.Length > 6_000_000) return Results.BadRequest(new { error = "References must be image data URLs under 4 MB." });
                var type = reference[..comma];
                string[] accepted = ["data:image/png;base64", "data:image/jpeg;base64", "data:image/webp;base64", "data:image/gif;base64"];
                if (!accepted.Contains(type)) return Results.BadRequest(new { error = "Use PNG, JPEG, WebP or GIF references." });
                message.Contents.Add(new DataContent(Convert.FromBase64String(reference[(comma + 1)..]), type[5..type.IndexOf(';')]));
            }
            var response = await resolved.Value.Client.GetResponseAsync(
                [new(ChatRole.System, SystemPrompt), message],
                new ChatOptions { ModelId = resolved.Value.ModelId },
                cancellationToken: timeout.Token);
            var answer = response.Text ?? string.Empty;
            var first = answer.IndexOf('{');
            var last = answer.LastIndexOf('}');
            if (first < 0 || last < first) throw new InvalidOperationException("The model returned no design JSON.");
            using var doc = JsonDocument.Parse(answer[first..(last + 1)]);
            Validate(doc.RootElement);
            return Results.Json(doc.RootElement.Clone());
        }
        catch (OperationCanceledException)
        {
            return Results.Problem("Design generation timed out or was cancelled. Your current slide is unchanged.", statusCode: 504);
        }
        catch (Exception exception)
        {
            return Results.Problem($"Design generation failed: {exception.Message}. Your current slide is unchanged.", statusCode: 422);
        }
    }

    static void Validate(JsonElement design)
    {
        var nodes = design.GetProperty("nodes");
        if (nodes.ValueKind != JsonValueKind.Array || nodes.GetArrayLength() is < 1 or > 40) throw new InvalidOperationException("A diagram needs 1–40 nodes.");
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var node in nodes.EnumerateArray())
        {
            var id = node.GetProperty("id").GetString() ?? string.Empty;
            if (id.Length == 0 || !ids.Add(id)) throw new InvalidOperationException("Node IDs must be present and unique.");
            if (string.IsNullOrWhiteSpace(node.GetProperty("label").GetString())) throw new InvalidOperationException("Each node needs a label.");
            var x = node.GetProperty("x").GetDouble();
            var y = node.GetProperty("y").GetDouble();
            var width = node.GetProperty("width").GetDouble();
            var height = node.GetProperty("height").GetDouble();
            if (!double.IsFinite(x + y + width + height) || x < 0 || y < 140 || width < 40 || height < 40 || x + width > 1600 || y + height > 800)
            {
                throw new InvalidOperationException($"Node '{id}' is outside the safe canvas.");
            }
        }
        if (design.TryGetProperty("edges", out var edges))
        {
            if (edges.GetArrayLength() > 80) throw new InvalidOperationException("Too many connectors.");
            foreach (var edge in edges.EnumerateArray())
            {
                if (!ids.Contains(edge.GetProperty("from").GetString()!) || !ids.Contains(edge.GetProperty("to").GetString()!)) throw new InvalidOperationException("A connector references an unknown node.");
            }
        }
    }
}
