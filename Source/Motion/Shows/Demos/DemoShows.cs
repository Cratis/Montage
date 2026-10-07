// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Json;
using Motion.AI;

namespace Motion.Shows.Demos;

/// <summary>
/// The two demo shows that ship with the editor, seeded into a fresh event store so a new
/// machine has something alive to watch: the pipeline speaks them with the real TTS, times
/// them with the real STT and renders them with the engine — no language model needed.
/// </summary>
public static class DemoShows
{
    /// <summary>Fixed event source id for the Motion-as-Code demo.</summary>
    public const string MotionAsCodeId = "1a07a4f5-6d18-4b3e-9f2c-7a51e0b9d301";

    /// <summary>Fixed event source id for the Monty Hall demo.</summary>
    public const string MontyHallId = "4c92e7b0-83f1-4a56-8d24-0e6b5c7f8402";

    /// <summary>
    /// The demo definitions: what the user "asked for" (the description seeded into
    /// ShowCreated) and the plan seeded into ShowPlanned.
    /// </summary>
    public static readonly IReadOnlyList<Definition> All =
    [
        new Definition(
            MotionAsCodeId,
            Title: "Motion as Code",
            Description: """
                Explain why writing video as a pure function of time beats hand-keyframing — for
                engineers who would rather ship than fiddle with timelines. Show the pipeline:
                describe, plan, voice, time, render. Big number: 60fps. Chart: hours by hand vs
                minutes with Motion. End on: stop keyframing, start describing.
                """,
            Voice: "af_heart",
            TargetDurationSeconds: 60,
            Tone: "confident, precise, dry humor",
            Audience: "developers",
            Plan: DemoMotionAsCode()),

        new Definition(
            MontyHallId,
            Title: "The Monty Hall Problem",
            Description: """
                Explain the Monty Hall problem so it finally clicks: three doors, a car, two
                goats, a host who knows. Steps for the game, the 66.6 percent on switching, a
                bar chart of stay versus switch across a hundred plays, and Laplace on
                probability. End on: always switch.
                """,
            Voice: "am_michael",
            TargetDurationSeconds: 50,
            Tone: "playful, clear",
            Audience: "everyone",
            Plan: DemoMontyHall()),

    ];

    static ShowPlan DemoMotionAsCode() => new()
    {
        Title = "Motion as Code",
        Scenes =
        [
            Scene(
                "title",
                "Every video you have ever shipped started as a blank timeline. This one started as a sentence.",
                """{ "kicker": "cratis motion", "headline": "Describe. Render. Done.", "emphasis": "sentence", "sub": "a demo, produced by the thing it demonstrates" }"""),

            Scene(
                "flow",
                "One pipeline draws it all. Describe hands over a prompt. Plan turns it into scenes. Voice speaks the story. Time locks every word to the waveform. And render makes frames — the same frames, every time.",
                """
                {
                  "headline": "One pipeline, five moves",
                  "kicker": "how it works",
                  "nodes": [
                    { "label": "Describe", "sub": "one prompt" },
                    { "label": "Plan", "sub": "story + scenes" },
                    { "label": "Voice", "sub": "self-hosted TTS" },
                    { "label": "Time", "sub": "word alignment" },
                    { "label": "Render", "sub": "deterministic" }
                  ]
                }
                """),

            Scene(
                "kinetic",
                "Because a scene is a pure function of time, the preview you scrub and the file you export are pixel identical. Always.",
                """{ "emphasis": ["pure", "pixel", "identical"] }"""),

            Scene(
                "metric",
                "Sixty frames every second, drawn on a canvas instead of a timeline. No drift, no jitter, no re-export roulette.",
                """{ "value": 60, "format": "number", "label": "frames per second, drawn on a canvas", "spark": [12, 18, 24, 30, 36, 42, 48, 54, 60] }"""),

            Scene(
                "chart",
                "The same ninety second explainer took four hours to keyframe by hand, forty minutes in a template, and two minutes here.",
                """{ "type": "bar", "title": "Time to a finished video", "labels": ["Keyframes", "Templates", "Motion"], "values": [240, 40, 2] }"""),

            Scene(
                "steps",
                "Three moves. First, describe the video you want. Second, let the pipeline plan it, speak it and time it. Third, press render and collect your file.",
                """
                {
                  "headline": "Three moves",
                  "steps": [
                    { "title": "Describe", "text": "one prompt, plain language" },
                    { "title": "Let it run", "text": "plan, voice, timing" },
                    { "title": "Render", "text": "an MP4 falls out" }
                  ]
                }
                """),

            Scene(
                "compare",
                "A timeline asks you to place every frame yourself. Motion asks you to say what matters. One is craft. The other is compounding.",
                """
                {
                  "headline": "Frames versus words",
                  "left": { "title": "Keyframing", "points": ["place every frame", "nudge and preview", "re-export to change one word"] },
                  "right": { "title": "Describing", "points": ["state what matters", "the plan carries the story", "change a word, re-render"] },
                  "verdict": "the timeline is the artifact; here, it is the output"
                }
                """),

            Scene(
                "endcard",
                "Stop keyframing. Start describing.",
                """{ "headline": "Stop keyframing.", "cta": "cratis.io/motion" }"""),
        ],
    };

    static ShowPlan DemoMontyHall() => new()
    {
        Title = "The Monty Hall Problem",
        Scenes =
        [
            Scene(
                "title",
                "In nineteen sixty three, a game show asked America a question that statisticians still argue about at dinner tables.",
                """{ "kicker": "a probability puzzle", "headline": "Two goats. One car.", "emphasis": "car" }"""),

            Scene(
                "steps",
                "Here is the whole game. One: you pick a door — one, two or three. Two: the host, who knows where the car is, opens a different door to reveal a goat. Three: you may switch to the remaining door.",
                """
                {
                  "headline": "The game",
                  "steps": [
                    { "title": "Pick a door", "text": "one chance in three" },
                    { "title": "Host opens a goat", "text": "he knows — he always can" },
                    { "title": "Switch or stay", "text": "your one decision" }
                  ]
                }
                """),

            Scene(
                "kinetic",
                "Your first pick was right one time in three. Which means the car is probably sitting behind one of the other two doors.",
                """{ "emphasis": ["one", "three", "probably"] }"""),

            Scene(
                "metric",
                "Switch, and two times in three you drive home in the car. Stay, and it is one time in three. The host's knowledge tilts the odds.",
                """{ "value": 66.6, "format": "percent", "label": "chance of the car when you switch", "delta": "+33.3 vs staying", "spark": [33, 33, 34, 40, 48, 55, 61, 66] }"""),

            Scene(
                "chart",
                "Play it a hundred times. Switching wins about sixty six games. Staying wins thirty three. The math does not care how you feel.",
                """{ "type": "bar", "title": "Wins in 100 plays", "labels": ["Stay", "Switch"], "values": [33, 67], "kicker": "simulated" }"""),

            Scene(
                "quote",
                "Probability theory is nothing but common sense, reduced to calculation.",
                """{ "text": "Probability theory is nothing but common sense reduced to calculation.", "attribution": "Pierre-Simon Laplace" }"""),

            Scene(
                "endcard",
                "Always switch.",
                """{ "headline": "Always switch.", "cta": "en.wikipedia.org — Monty Hall problem" }"""),
        ],
    };

    static PlannedScene Scene(string type, string spoken, string? parameters = null)
    {
        var parametersDictionary = new Dictionary<string, JsonElement>();
        if (parameters is not null)
        {
            foreach (var property in JsonSerializer.Deserialize<JsonElement>(parameters).EnumerateObject())
            {
                parametersDictionary[property.Name] = property.Value.Clone();
            }
        }

        return new PlannedScene { Type = type, Spoken = spoken, Params = parametersDictionary };
    }
}

/// <summary>
/// One demo: the creation request (what the user "typed") plus the plan that is seeded as
/// if the planner had produced it.
/// </summary>
/// <param name="Id">The fixed show identifier.</param>
/// <param name="Title">Working title.</param>
/// <param name="Description">The prompt.</param>
/// <param name="Voice">TTS voice to speak it with.</param>
/// <param name="TargetDurationSeconds">Rough target length.</param>
/// <param name="Tone">Tone hint.</param>
/// <param name="Audience">Audience hint.</param>
/// <param name="Plan">The planned scenes.</param>
public sealed record Definition(
    string Id,
    string Title,
    string Description,
    string Voice,
    double TargetDurationSeconds,
    string Tone,
    string Audience,
    ShowPlan Plan);
