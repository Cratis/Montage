// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

namespace Motion.Shows.Demos;

/// <summary>
/// Semantic versions of the blog's diagrams: real boxes and routed links, not screenshots.
/// Positions use the infographic's 1600 by 900 SVG viewBox; each object has a build beat.
/// </summary>
public static class DemoDiagrams
{
    /// <summary>The blog's three parallel platform rows, drawn box by box.</summary>
    public const string Platforms = """
        {
          "headline": "Every platform has its IL", "template": "cratis", "effect": "draw",
          "describe": "Trace each rounded box, then fade its fill and label. Draw the arrows left to right. Build .NET, then JVM, then Business; amber marks the business analogy. Hold the completed diagram.",
          "nodes": [
            {"id":"dotnet","label":".NET","x":64,"y":180,"width":210,"height":150,"at":0.5},
            {"id":"cs","label":"C#, F#","x":310,"y":180,"width":410,"height":150,"at":1.1},
            {"id":"il","label":"IL","x":780,"y":180,"width":300,"height":150,"color":"#80b9ff","at":2.1},
            {"id":"clr","label":"CLR","x":1140,"y":180,"width":396,"height":150,"at":3.1},
            {"id":"jvm","label":"JVM","x":64,"y":390,"width":210,"height":150,"at":3.8},
            {"id":"java","label":"Java, Kotlin","x":310,"y":390,"width":410,"height":150,"at":4.4},
            {"id":"bytecode","label":"Bytecode","x":780,"y":390,"width":300,"height":150,"color":"#80b9ff","at":5.4},
            {"id":"vm","label":"JVM","x":1140,"y":390,"width":396,"height":150,"at":6.4},
            {"id":"business","label":"Business","x":64,"y":600,"width":210,"height":150,"color":"#ffcb70","at":7.1},
            {"id":"teams","label":"Teams, AI, code","x":310,"y":600,"width":410,"height":150,"color":"#ffcb70","at":7.7},
            {"id":"play","label":"Screenplay","x":780,"y":600,"width":300,"height":150,"color":"#ffcb70","at":8.7},
            {"id":"apps","label":"Boards, apps","x":1140,"y":600,"width":396,"height":150,"color":"#ffcb70","at":9.7}
          ],
          "edges": [{"from":"cs","to":"il"},{"from":"il","to":"clr"},{"from":"java","to":"bytecode"},{"from":"bytecode","to":"vm"},{"from":"teams","to":"play"},{"from":"play","to":"apps"}]
        }
        """;

    /// <summary>The many-to-one, one-to-many Screenplay hub from the blog.</summary>
    public const string Hub = """
        {
          "headline":"One language in the middle", "template":"blueprint", "effect":"pen",
          "describe":"A glowing drafting pen draws the producers, their routed arrows converge on Screenplay, then the consumers emerge. Preserve the hub layout and reading order.",
          "nodes":[
            {"id":"people","label":"People","x":64,"y":165,"width":300,"height":95,"at":0.4},
            {"id":"ai","label":"AI assistants","x":64,"y":295,"width":300,"height":95,"at":0.9},
            {"id":"studio","label":"Studio","x":64,"y":425,"width":300,"height":95,"at":1.4},
            {"id":"code","label":"C# code","x":64,"y":555,"width":300,"height":95,"at":1.9},
            {"id":"systems","label":"Live systems","x":64,"y":685,"width":300,"height":95,"at":2.4},
            {"id":"play","label":"Screenplay · .play","x":640,"y":380,"width":320,"height":150,"color":"#54d8e7","at":3.4},
            {"id":"models","label":"Event models","x":1230,"y":220,"width":300,"height":110,"at":4.8},
            {"id":"apps","label":"Running apps","x":1230,"y":365,"width":300,"height":110,"at":5.4},
            {"id":"generated","label":"Generated code","x":1230,"y":510,"width":300,"height":110,"at":6.0},
            {"id":"diagnostics","label":"Diagnostics","x":1230,"y":655,"width":300,"height":110,"at":6.6}
          ],
          "edges":[
            {"from":"people","to":"play"},{"from":"ai","to":"play"},{"from":"studio","to":"play"},{"from":"code","to":"play"},{"from":"systems","to":"play"},
            {"from":"play","to":"models","at":4.2},{"from":"play","to":"apps","at":4.8},{"from":"play","to":"generated","at":5.4},{"from":"play","to":"diagnostics","at":6.0}
          ]
        }
        """;

    /// <summary>The shared board's fan-out to six hosts.</summary>
    public const string Hosts = """
        {
          "headline":"One board, many hosts", "template":"cratis", "effect":"wipe",
          "describe":"Reveal the central board with a horizontal mask. Trace branching connectors, then reveal each host. Keep every label stable as new hosts arrive.",
          "nodes":[
            {"id":"board","label":"@cratis/event-models","x":540,"y":380,"width":520,"height":150,"color":"#ffcb70","at":0.5},
            {"id":"studio","label":"Studio","x":90,"y":170,"width":380,"height":130,"at":2},
            {"id":"vscode","label":"VS Code","x":610,"y":170,"width":380,"height":130,"at":2.6},
            {"id":"mcp","label":"MCP Apps hosts","x":1130,"y":170,"width":380,"height":130,"at":3.2},
            {"id":"arc","label":"Arc explorer","x":90,"y":640,"width":380,"height":130,"at":3.8},
            {"id":"view","label":"cratis view","x":610,"y":640,"width":380,"height":130,"at":4.4},
            {"id":"app","label":"Your own app","x":1130,"y":640,"width":380,"height":130,"at":5}
          ],
          "edges":[{"from":"board","to":"studio","at":1.3},{"from":"board","to":"vscode","at":1.9},{"from":"board","to":"mcp","at":2.5},{"from":"board","to":"arc","at":3.1},{"from":"board","to":"view","at":3.7},{"from":"board","to":"app","at":4.3}]
        }
        """;
}
