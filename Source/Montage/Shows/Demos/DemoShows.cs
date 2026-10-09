// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Json;
using Montage.AI;

namespace Montage.Shows.Demos;

/// <summary>
/// The two demo shows that ship with the editor, seeded into a fresh event store so a new
/// machine has something alive to watch: the pipeline speaks them with the real TTS, times
/// them with the real STT and renders them with the engine — no language model needed.
/// </summary>
public static class DemoShows
{
    /// <summary>Fixed event source id for the Montage-as-Code demo.</summary>
    public const string MotionAsCodeId = "1a07a4f5-6d18-4b3e-9f2c-7a51e0b9d301";

    /// <summary>Fixed event source id for the Monty Hall demo.</summary>
    public const string MontyHallId = "4c92e7b0-83f1-4a56-8d24-0e6b5c7f8402";

    /// <summary>Fixed event source id for the assembly-language infographics demo.</summary>
    public const string AssemblyLanguageId = "8f4c2a10-3b7d-4e52-9a61-0c5d84e2f7b3";

    /// <summary>Fixed event source id for the picture-in-motion demo.</summary>
    public const string PictureThisId = "2d95e6c8-71a4-4f03-b8ce-4512f9a06d77";

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
                minutes with Montage. End on: stop keyframing, start describing.
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

        new Definition(
            AssemblyLanguageId,
            Title: "The Assembly Language of the Business",
            Description: """
                Turn the blog post "Screenplay — the assembly language of the business" into an
                animated infographics video. IL gave .NET one format every tool could read; the
                business side never had that until Screenplay. Show the pattern (one language in
                the middle), a real .play slice, documents versus a compiling language, the
                first hour as steps, six commands to the first event, and the board that appears
                from a .play file. End on: one model, every tool.
                """,
            Voice: "af_heart",
            TargetDurationSeconds: 55,
            Tone: "sharp, essayistic, confident",
            Audience: "architects and tech leads",
            Plan: DemoAssemblyLanguage()),

        new Definition(
            PictureThisId,
            Title: "Picture This",
            Description: """
                Show what it means for images on a slide to move with intent: three pictures with
                three different motions — a Ken Burns drift, a zoom into the one line that
                matters, a card that slides in — then a single quiet shot, a kinetic beat about
                holding the last note, and a closing thought. Every image carries a direction:
                what should happen to it, in plain words.
                """,
            Voice: "am_michael",
            TargetDurationSeconds: 40,
            Tone: "warm, visual, unhurried",
            Audience: "everyone",
            Plan: DemoPictureThis()),

    ];

    static ShowPlan DemoMotionAsCode() => new()
    {
        Title = "Motion as Code",
        Scenes =
        [
            Scene(
                "title",
                "Every video you have ever shipped started as a blank timeline. This one started as a sentence.",
                """{ "kicker": "cratis montage", "headline": "Describe. Render. Done.", "emphasis": "sentence", "sub": "a demo, produced by the thing it demonstrates" }"""),

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
                """{ "emphasis": ["pure", "pixel", "identical"], "pacing": { "hold": 0.5 } }"""),

            Scene(
                "metric",
                "Sixty frames every second, drawn on a canvas instead of a timeline. No drift, no jitter, no re-export roulette.",
                """{ "value": 60, "format": "number", "label": "frames per second, drawn on a canvas", "spark": [12, 18, 24, 30, 36, 42, 48, 54, 60] }"""),

            Scene(
                "chart",
                "The same ninety second explainer took four hours to keyframe by hand, forty minutes in a template, and two minutes here.",
                """{ "type": "bar", "title": "Time to a finished video", "labels": ["Keyframes", "Templates", "Montage"], "values": [240, 40, 2] }"""),

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
                "A timeline asks you to place every frame yourself. Montage asks you to say what matters. One is craft. The other is compounding.",
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
                """{ "headline": "Stop keyframing.", "cta": "cratis.io/montage" }"""),
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

    static ShowPlan DemoAssemblyLanguage() => new()
    {
        Title = "The Assembly Language of the Business",
        Scenes =
        [
            Scene(
                "title",
                "Let's face it: nobody gets excited about intermediate languages. And yet they are among the most important ideas our industry ever had.",
                """{ "kicker": "cratis screenplay", "headline": "The assembly language of the business", "emphasis": "assembly", "sub": "a story in animated infographics" }"""),

            Scene(
                "statement",
                "Think about what I L actually did for dotnet. Every language compiles down to the same thing, and every tool that came after works on every language, for free.",
                """{ "kicker": "the superpower", "headline": "One format in the middle. Every tool works.", "accent": "Every tool" }"""),

            Scene(
                "diagram",
                "A language above, a runtime below, and a small stable format between them. Dotnet has I L. The J V M has bytecode. And now the business has Screenplay.",
                DemoDiagrams.Platforms),

            Scene(
                "code",
                "A slice is written in seconds. A command with its validation, the event it produces and the read model it feeds, all in one honest indent.",
                """
                {
                  "title": "library.play",
                  "kicker": "a real slice",
                  "language": "json",
                  "highlight": [6],
                  "code": "slice StateChange AddBook\n  command AddBook\n    bookId BookId identifier\n    isbn Isbn, title BookTitle\n    authorize IsLibrarian\n  produces BookAdded\n    for bookId\n  event BookAdded"
                }
                """),

            Scene(
                "compare",
                "The business side never had that. We had whiteboards, sticky notes and documents that drifted the moment the meeting ended. Screenplay compiles, so it cannot drift.",
                """
                {
                  "headline": "Documents versus a language",
                  "left": { "title": "Design documents", "points": ["drift from the code", "stale after sprint one", "read by nobody"] },
                  "right": { "title": "Screenplay", "points": ["compiles with diagnostics", "draws the board", "boots the sandbox"] },
                  "verdict": "the model is the source of truth"
                }
                """),

            Scene(
                "diagram",
                "One board, many hosts. Studio, V S Code and M C P Apps above. Arc explorer, cratis view and your own application below. Every host draws the same model with the same board package.",
                DemoDiagrams.Hosts),

            Scene(
                "metric",
                "Six commands from an empty folder to your first event. Six.",
                """{ "value": 6, "format": "number", "label": "commands from empty folder to first event", "delta": "install · new · up · run · dev · open", "spark": [1, 2, 3, 3, 4, 5, 6] }"""),

            Scene(
                "diagram",
                "People, A I assistants, Studio, C sharp code and live systems all write Screenplay. Event models, running apps, generated code and diagnostics all read it. Nobody on the left has to know who is on the right.",
                DemoDiagrams.Hub),

            Scene(
                "endcard",
                "Write the model once. Get the boards, the apps and the truth. That is the assembly language of the business.",
                """{ "headline": "One model. Every tool.", "cta": "cratis.io/screenplay" }"""),
        ],
    };

    static ShowPlan DemoPictureThis() => new()
    {
        Title = "Picture This",
        Scenes =
        [
            Scene(
                "title",
                "A screenshot is a fact. But a fact that just sits there is easy to scroll past. This one is about giving pictures intent.",
                """{ "kicker": "cratis montage", "headline": "Picture This", "emphasis": "intent", "sub": "images that move with a reason" }"""),

            Scene(
                "image",
                "Three pictures, three directions. The board drifts — a Ken Burns hold. The workbench zooms into the one line that matters. And the first hour slides in like a checklist being ticked.",
                """
                {
                  "images": [
                    { "src": "images/board.svg", "headline": "drift", "motion": "kenburns", "describe": "slow diagonal Ken Burns drift across the board" },
                    { "src": "images/workbench.svg", "headline": "reveal", "motion": "zoom-in", "describe": "push in toward the highlighted event line" },
                    { "src": "images/first-hour.svg", "headline": "arrive", "motion": "slide", "describe": "slide in from the right like a card" }
                  ],
                  "headline": "One picture, one direction"
                }
                """),

            Scene(
                "kinetic",
                "A photograph is a fact. Montage is the emphasis you put on it. Hold the last beat, let it breathe, and the meaning lands.",
                """{ "emphasis": ["fact", "emphasis", "breathe"], "pacing": { "hold": 0.6 } }"""),

            Scene(
                "quote",
                "Pictures do not move by themselves. Someone chooses the drift, the zoom, the hold.",
                """{ "text": "Pictures do not move by themselves. Someone chooses the drift, the zoom, the hold.", "attribution": "the Montage manual" }"""),

            Scene(
                "image",
                "One image, one caption, one slow push. Nothing else. That is all a product shot needs.",
                """
                {
                  "images": [
                    {
                      "src": "images/workbench.svg",
                      "headline": "event 42 — Registered",
                      "motion": "zoom-in",
                      "describe": "slow zoom toward the highlighted event in the log"
                    }
                  ],
                  "headline": "Zoom into what matters",
                  "text": "the event that made the name appear"
                }
                """),

            Scene(
                "endcard",
                "Show the picture. Then move it with intent.",
                """{ "headline": "Show. Then move.", "cta": "cratis.io/montage" }"""),
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
