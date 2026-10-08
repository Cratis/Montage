// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.Chronicle.Seeding;
using Motion.Shows.Creation;
using Motion.Shows.Planning;

#if DEBUG
namespace Motion.Shows.Demos;

/// <summary>
/// The images the demo shows reference. Written into a show's durable assets folder at seed
/// time so the pipeline's packager picks them up like any user upload; the scenes carry the
/// same package-relative paths (<c>images/…</c>). SVG keeps them crisp and tiny.
/// </summary>
public static class DemoAssets
{
    const string Board = """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750">
          <rect width="1200" height="750" fill="#0d1017"/>
          <rect x="40" y="36" width="1120" height="54" rx="12" fill="#151a24"/>
          <rect x="64" y="54" width="150" height="18" rx="9" fill="#8b7ff4"/>
          <rect x="234" y="54" width="110" height="18" rx="9" fill="#2a3142"/>
          <rect x="364" y="54" width="130" height="18" rx="9" fill="#2a3142"/>
          <text x="70" y="68" font-family="ui-monospace, monospace" font-size="15" fill="#0d1017">Catalog</text>
          <text x="800" y="68" font-family="ui-monospace, monospace" font-size="15" fill="#6b7691">modules · features · slices</text>
          <g>
            <rect x="40" y="120" width="352" height="520" rx="14" fill="#151a24"/>
            <text x="64" y="156" font-family="ui-monospace, monospace" font-size="17" fill="#aab4cc">AddBook</text>
            <rect x="64" y="176" width="304" height="64" rx="10" fill="#1d2331"/>
            <rect x="80" y="192" width="180" height="12" rx="6" fill="#5fd4c4"/>
            <rect x="80" y="214" width="120" height="12" rx="6" fill="#3a4356"/>
            <rect x="64" y="252" width="304" height="64" rx="10" fill="#1d2331"/>
            <rect x="80" y="268" width="200" height="12" rx="6" fill="#8b7ff4"/>
            <rect x="80" y="290" width="150" height="12" rx="6" fill="#3a4356"/>
            <rect x="64" y="328" width="304" height="64" rx="10" fill="#1d2331"/>
            <rect x="80" y="344" width="160" height="12" rx="6" fill="#e8a34f"/>
            <rect x="80" y="366" width="130" height="12" rx="6" fill="#3a4356"/>
            <text x="64" y="440" font-family="ui-monospace, monospace" font-size="15" fill="#6b7691">Librarian</text>
            <rect x="64" y="456" width="304" height="88" rx="10" fill="#1d2331"/>
            <rect x="80" y="472" width="220" height="12" rx="6" fill="#3a4356"/>
            <rect x="80" y="494" width="180" height="12" rx="6" fill="#3a4356"/>
            <rect x="80" y="516" width="200" height="12" rx="6" fill="#3a4356"/>
          </g>
          <g>
            <rect x="424" y="120" width="352" height="520" rx="14" fill="#151a24"/>
            <text x="448" y="156" font-family="ui-monospace, monospace" font-size="17" fill="#aab4cc">BookCatalog</text>
            <rect x="448" y="176" width="304" height="64" rx="10" fill="#1d2331"/>
            <rect x="464" y="192" width="190" height="12" rx="6" fill="#5fd4c4"/>
            <rect x="464" y="214" width="140" height="12" rx="6" fill="#3a4356"/>
            <rect x="448" y="252" width="304" height="64" rx="10" fill="#242c3d" stroke="#8b7ff4" stroke-width="2"/>
            <rect x="464" y="268" width="230" height="12" rx="6" fill="#8b7ff4"/>
            <rect x="464" y="290" width="160" height="12" rx="6" fill="#4a5470"/>
            <text x="448" y="360" font-family="ui-monospace, monospace" font-size="15" fill="#6b7691">Member</text>
            <rect x="448" y="376" width="304" height="88" rx="10" fill="#1d2331"/>
            <rect x="464" y="392" width="200" height="12" rx="6" fill="#3a4356"/>
            <rect x="464" y="414" width="170" height="12" rx="6" fill="#3a4356"/>
            <rect x="464" y="436" width="190" height="12" rx="6" fill="#3a4356"/>
          </g>
          <g>
            <rect x="808" y="120" width="352" height="520" rx="14" fill="#151a24"/>
            <text x="832" y="156" font-family="ui-monospace, monospace" font-size="17" fill="#aab4cc">OpeningHours</text>
            <rect x="832" y="176" width="304" height="64" rx="10" fill="#1d2331"/>
            <rect x="848" y="192" width="170" height="12" rx="6" fill="#5fd4c4"/>
            <rect x="848" y="214" width="130" height="12" rx="6" fill="#3a4356"/>
            <rect x="832" y="252" width="304" height="140" rx="10" fill="#1d2331"/>
            <text x="848" y="284" font-family="ui-monospace, monospace" font-size="15" fill="#8b7ff4">spec: AddBook</text>
            <text x="848" y="312" font-family="ui-monospace, monospace" font-size="14" fill="#6b7691">given an empty catalog</text>
            <text x="848" y="336" font-family="ui-monospace, monospace" font-size="14" fill="#6b7691">  when a librarian adds a book</text>
            <text x="848" y="360" font-family="ui-monospace, monospace" font-size="14" fill="#6b7691">  then BookAdded is produced</text>
          </g>
        </svg>
        """;

    const string Workbench = """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750">
          <rect width="1200" height="750" fill="#0d1017"/>
          <rect x="60" y="50" width="1080" height="620" rx="16" fill="#151a24"/>
          <rect x="60" y="50" width="1080" height="56" rx="16" fill="#1d2331"/>
          <circle cx="100" cy="78" r="9" fill="#e8695f"/>
          <circle cx="128" cy="78" r="9" fill="#e8a34f"/>
          <circle cx="156" cy="78" r="9" fill="#5fd4c4"/>
          <text x="600" y="84" text-anchor="middle" font-family="ui-monospace, monospace" font-size="16" fill="#6b7691">chronicle workbench — MyStore</text>
          <text x="96" y="150" font-family="ui-monospace, monospace" font-size="16" fill="#5fd4c4">▸ event log</text>
          <text x="96" y="182" font-family="ui-monospace, monospace" font-size="16" fill="#4a5470">  event types</text>
          <text x="96" y="214" font-family="ui-monospace, monospace" font-size="16" fill="#4a5470">  projections</text>
          <text x="96" y="246" font-family="ui-monospace, monospace" font-size="16" fill="#4a5470">  observers</text>
          <rect x="90" y="128" width="4" height="130" rx="2" fill="#8b7ff4"/>
          <g font-family="ui-monospace, monospace" font-size="16">
            <text x="320" y="152" fill="#6b7691">seq</text><text x="400" y="152" fill="#6b7691">type</text><text x="640" y="152" fill="#6b7691">occurred</text>
            <text x="320" y="196" fill="#aab4cc">41</text><text x="400" y="196" fill="#aab4cc">Registered</text><text x="640" y="196" fill="#6b7691">10:41:02</text>
            <rect x="300" y="216" width="800" height="40" rx="8" fill="#242c3d"/>
            <text x="320" y="242" fill="#8b7ff4">42</text><text x="400" y="242" fill="#8b7ff4">Registered</text><text x="640" y="242" fill="#6b7691">10:41:09</text>
            <text x="320" y="286" fill="#aab4cc">43</text><text x="400" y="286" fill="#aab4cc">BookAdded</text><text x="640" y="286" fill="#6b7691">10:42:17</text>
            <text x="320" y="330" fill="#aab4cc">44</text><text x="400" y="330" fill="#aab4cc">BookBorrowed</text><text x="640" y="330" fill="#6b7691">10:43:55</text>
          </g>
          <rect x="300" y="380" width="800" height="200" rx="12" fill="#10141d"/>
          <text x="330" y="420" font-family="ui-monospace, monospace" font-size="16" fill="#8b7ff4">event 42 · Registered</text>
          <text x="330" y="456" font-family="ui-monospace, monospace" font-size="16" fill="#aab4cc">{</text>
          <text x="330" y="488" font-family="ui-monospace, monospace" font-size="16" fill="#5fd4c4">  "name": "Corwin Ashdown"</text>
          <text x="330" y="520" font-family="ui-monospace, monospace" font-size="16" fill="#aab4cc">}</text>
          <text x="330" y="556" font-family="ui-monospace, monospace" font-size="14" fill="#4a5470">appended by Library · CommandScenario verified</text>
        </svg>
        """;

    const string FirstHour = """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750">
          <rect width="1200" height="750" fill="#0d1017"/>
          <text x="600" y="110" text-anchor="middle" font-family="ui-monospace, monospace" font-size="22" fill="#aab4cc">the first hour</text>
          <rect x="120" y="330" width="960" height="4" fill="#242c3d"/>
          <g font-family="ui-monospace, monospace">
            <circle cx="160" cy="332" r="34" fill="#151a24" stroke="#8b7ff4" stroke-width="3"/>
            <text x="160" y="340" text-anchor="middle" font-size="22" fill="#8b7ff4">1</text>
            <text x="160" y="404" text-anchor="middle" font-size="15" fill="#6b7691">install</text>
            <circle cx="344" cy="332" r="34" fill="#151a24" stroke="#8b7ff4" stroke-width="3"/>
            <text x="344" y="340" text-anchor="middle" font-size="22" fill="#8b7ff4">2</text>
            <text x="344" y="404" text-anchor="middle" font-size="15" fill="#6b7691">scaffold</text>
            <circle cx="528" cy="332" r="34" fill="#151a24" stroke="#8b7ff4" stroke-width="3"/>
            <text x="528" y="340" text-anchor="middle" font-size="22" fill="#8b7ff4">3</text>
            <text x="528" y="404" text-anchor="middle" font-size="15" fill="#6b7691">compose up</text>
            <circle cx="712" cy="332" r="34" fill="#151a24" stroke="#8b7ff4" stroke-width="3"/>
            <text x="712" y="340" text-anchor="middle" font-size="22" fill="#8b7ff4">4</text>
            <text x="712" y="404" text-anchor="middle" font-size="15" fill="#6b7691">dotnet run</text>
            <circle cx="896" cy="332" r="34" fill="#151a24" stroke="#8b7ff4" stroke-width="3"/>
            <text x="896" y="340" text-anchor="middle" font-size="22" fill="#8b7ff4">5</text>
            <text x="896" y="404" text-anchor="middle" font-size="15" fill="#6b7691">yarn dev</text>
            <circle cx="1080" cy="332" r="38" fill="#8b7ff4"/>
            <text x="1080" y="341" text-anchor="middle" font-size="24" fill="#0d1017">6</text>
            <text x="1080" y="408" text-anchor="middle" font-size="15" fill="#8b7ff4">first event</text>
          </g>
          <rect x="220" y="480" width="760" height="150" rx="12" fill="#151a24"/>
          <g font-family="ui-monospace, monospace" font-size="16">
            <text x="250" y="520" fill="#6b7691">$</text><text x="272" y="520" fill="#aab4cc">dotnet new install Cratis.Templates</text>
            <text x="250" y="552" fill="#6b7691">$</text><text x="272" y="552" fill="#aab4cc">dotnet new cratis -n MyStore</text>
            <text x="250" y="584" fill="#6b7691">$</text><text x="272" y="584" fill="#aab4cc">docker compose up -d</text>
            <text x="250" y="616" fill="#5fd4c4">✓ Chronicle is listening on localhost:35000</text>
          </g>
        </svg>
        """;

    /// <summary>
    /// The assets per demo show id.
    /// </summary>
    static readonly Dictionary<string, IReadOnlyDictionary<string, string>> ForDemo = new()
    {
        [DemoShows.AssemblyLanguageId] = new Dictionary<string, string>
        {
            ["board.svg"] = Board,
            ["workbench.svg"] = Workbench,
            ["first-hour.svg"] = FirstHour,
        },
        [DemoShows.PictureThisId] = new Dictionary<string, string>
        {
            ["board.svg"] = Board,
            ["workbench.svg"] = Workbench,
            ["first-hour.svg"] = FirstHour,
        },
    };

    /// <summary>
    /// Writes the demo's image assets into its durable assets folder. No-op for demos without assets.
    /// </summary>
    /// <param name="artifactStore">The artifact store.</param>
    /// <param name="showId">The demo show.</param>
    public static void Write(ShowArtifactStore artifactStore, ShowId showId)
    {
        if (!ForDemo.TryGetValue(showId.ToString(), out var assets)) return;
        foreach (var (name, content) in assets)
        {
            ShowArtifactStore.WriteText(Path.Combine(artifactStore.AssetsFolderFor(showId), "images", name), content);
        }
    }
}
#endif
