// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.AI.Configuration;
using Microsoft.Extensions.FileProviders;
using Montage;
using Montage.Hosting;
using AspNetCoreArcBuilderExtensions = Microsoft.AspNetCore.Builder.ArcBuilderExtensions;

var builder = WebApplication.CreateBuilder(args);

// The speech containers get dynamic host ports under Aspire, which injects their allocated
// endpoints as services__<name>__http__0. Prefer those over the configured defaults so the
// pipeline always talks to the real Kokoro/Speaches, not whatever shares their port.
foreach (var (service, section) in new[] { ("tts", "Tts"), ("stt", "Stt") })
{
    var endpoint = builder.Configuration[$"services__{service}__http__0"];
    if (!string.IsNullOrWhiteSpace(endpoint)) builder.Configuration[$"Cratis:Montage:{section}:Endpoint"] = $"http://{endpoint}";
}
builder.Configuration.AddJsonFile("appsettings.local.json", optional: true, reloadOnChange: false);

builder.Services.AddOptions<MontageOptions>().BindConfiguration("Cratis:Montage").ValidateDataAnnotations();

builder.Services.AddSingleton<Montage.Shows.Packaging.IShowPackager, Montage.Shows.Packaging.ShowPackager>();
builder.Services.AddSingleton<Montage.Shows.Packaging.IFfmpeg, Montage.Shows.Packaging.Ffmpeg>();
builder.Services.AddSingleton<Montage.Shows.Rendering.IVideoRenderer, Montage.Shows.Rendering.EngineRenderer>();
builder.Services.AddSingleton<Montage.Shows.Rendering.IEngineStills, Montage.Shows.Rendering.EngineStills>();
builder.Services.AddSingleton<Montage.Speech.ISpeechSynthesizer, Montage.Speech.SpeechSynthesizer>();
builder.Services.AddSingleton<Montage.Speech.ISpeechTranscriber, Montage.Speech.SpeechTranscriber>();

// Must run before AddCratisArc (which snapshots Arc's type universe the first time it is
// touched) - a lazily-loaded Cratis.AI.dll afterwards would contribute its providers, commands
// and queries to that universe silently too late. Montage's one agent seam - the planner - goes
// with it; the providers themselves are configured at runtime through Cratis.AI's own commands.
builder.Services.AddCratisAI(ai => ai
    .WithAgents<Montage.AI.MontageAIAgents>());

builder = builder
    .AddCratisArc(
        configureOptions: options =>
        {
            options.GeneratedApis.RoutePrefix = "api";
            options.GeneratedApis.SegmentsToSkipForRoute = 1;
        },
        configureBuilder: arcBuilder => AspNetCoreArcBuilderExtensions.WithChronicle(arcBuilder))
    .AddCratisChronicle(options => options.EventStore = "Montage");
builder.UseCratisMongoDB();

// After UseCratisMongoDB: the job system's MongoDB storage registers the concrete IMongoClient
// the silo owns, and that registration must be the one that wins - the jobs storage is a
// singleton and cannot consume a scoped client. Same arrangement as Direct's AddDirectOrleans.
builder.AddMontageOrleans();
builder.Services.AddControllers();
builder.Services.AddMvc();
builder.Services.AddSwaggerGen(options => options.AddConcepts());
builder.Services.Configure<Microsoft.AspNetCore.Mvc.ApiBehaviorOptions>(options => options.SuppressModelStateInvalidFilter = true);

var app = builder.Build();

app.UseRouting();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseWebSockets();
app.MapControllers();
app.UseCratisArc();
app.UseCratisChronicle();

app.UseSwagger();
app.UseSwaggerUI(options => options.SwaggerEndpoint("/swagger/v1/swagger.json", "Montage"));

// Serve generated show packages at /packages/{showId}/... so the engine preview can load them.
var montage = app.Services.GetRequiredService<IOptions<MontageOptions>>().Value;
var workspace = montage.WorkspacePathFor(app.Environment.ContentRootPath);
Directory.CreateDirectory(Path.Combine(workspace, "shows"));
Directory.CreateDirectory(Path.Combine(workspace, "renders"));
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Path.Combine(workspace, "shows")),
    RequestPath = "/packages",
    ServeUnknownFileTypes = true,
});

// Rendered videos at /renders/{file}.
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(Path.Combine(workspace, "renders")),
    RequestPath = "/renders",
    ServeUnknownFileTypes = true,
    OnPrepareResponse = ctx => ctx.Context.Response.ContentType = "video/mp4",
});

// Voice catalog: what the TTS service actually offers, and an audition line per voice.
// Minimal API endpoints - Arc owns the /api space for commands and queries, so controllers
// would never be reached here.
var voiceCatalog = new Montage.Speech.VoiceCatalog(
    app.Services.GetRequiredService<Montage.Speech.ISpeechSynthesizer>(),
    app.Services.GetRequiredService<IOptions<MontageOptions>>());
app.MapGet("/api/montage/voices", async () => Results.Json(await voiceCatalog.All()));
app.MapGet("/api/montage/voices/preview", async (string voice) =>
{
    var (contentType, bytes, status, error) = await voiceCatalog.Preview(voice);
    return status == 200 ? Results.File(bytes, contentType) : Results.Problem(error, statusCode: status);
});

// Image uploads: durable per-show assets. Written under {show}/assets/images and mirrored
// into the current package (when one exists) so the preview sees them immediately; the
// packager copies assets into every package it writes, so they survive a re-package.
var showArtifacts = app.Services.GetRequiredService<Montage.Shows.ShowArtifactStore>();
app.MapPost("/api/montage/shows/{id}/images", async (string id, HttpRequest request) =>
{
    var form = await request.ReadFormAsync();
    var file = form.Files.Count > 0 ? form.Files[0] : null;
    if (file is null || file.Length == 0) return Results.BadRequest(new { error = "no file" });

    var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
    string[] allowed = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
    if (!allowed.Contains(extension)) return Results.BadRequest(new { error = $"unsupported file type '{extension}'" });

    var showId = Montage.Shows.ShowId.From(id);
    var name = $"{Guid.NewGuid().ToString("N")[..8]}{extension}";
    var assets = Path.Combine(showArtifacts.AssetsFolderFor(showId), "images");
    Directory.CreateDirectory(assets);
    var assetsPath = Path.Combine(assets, name);
    await using (var stream = File.Create(assetsPath))
    {
        await file.CopyToAsync(stream);
    }

    var package = showArtifacts.PackageDirectory(showId);
    if (Directory.Exists(package))
    {
        var packageImages = Path.Combine(package, "images");
        Directory.CreateDirectory(packageImages);
        File.Copy(assetsPath, Path.Combine(packageImages, name), overwrite: true);
    }

    return Results.Ok(new { path = $"images/{name}" });
});

Montage.Shows.Design.DesignEndpoints.Map(app, workspace);

app.MapFallbackToFile("/index.html");

await app.RunAsync();

