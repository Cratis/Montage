// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

namespace Motion.Shows;

/// <summary>
/// Knows where a show's artifacts live on disk and creates the folders. The file system is
/// the artifact store: the ZIP is the package, the MP4s are the renders, everything else is
/// working material for the pipeline.
/// </summary>
public sealed class ShowArtifactStore(IOptions<MotionOptions> options, IHostEnvironment environment)
{
    /// <summary>
    /// Gets the workspace root.
    /// </summary>
    public string Root { get; } = options.Value.WorkspacePathFor(environment.ContentRootPath);

    /// <summary>
    /// Gets the folder for a show, creating it if needed.
    /// </summary>
    /// <param name="showId">The show.</param>
    /// <returns>The folder path.</returns>
    public string FolderFor(ShowId showId)
    {
        var folder = Path.Combine(Root, "shows", showId.Value.ToString());
        Directory.CreateDirectory(folder);
        return folder;
    }

    /// <summary>
    /// Gets the renders folder for a show, creating it if needed.
    /// </summary>
    /// <param name="showId">The show.</param>
    /// <returns>The folder path.</returns>
    public string RendersFolderFor(ShowId showId)
    {
        var folder = Path.Combine(FolderFor(showId), "renders");
        Directory.CreateDirectory(folder);
        return folder;
    }

    /// <summary>
    /// Paths inside a show folder.
    /// </summary>
    public string PlanJson(ShowId showId) => Path.Combine(FolderFor(showId), "plan.json");
    public string VoiceoverWav(ShowId showId) => Path.Combine(FolderFor(showId), "voiceover.wav");
    public string VoiceoverAudio(ShowId showId) => Path.Combine(FolderFor(showId), "voiceover.mp3");
    public string LyricsJson(ShowId showId) => Path.Combine(FolderFor(showId), "lyrics.json");
    public string AudioAnalysisJson(ShowId showId) => Path.Combine(FolderFor(showId), "audio.json");
    public string PackageDirectory(ShowId showId) => Path.Combine(FolderFor(showId), "package");
    public string PackageZip(ShowId showId) => Path.Combine(FolderFor(showId), "package.zip");

    /// <summary>
    /// Reads a text file if it exists.
    /// </summary>
    /// <param name="path">The path.</param>
    /// <returns>Contents or null.</returns>
    public static string? ReadTextOrNull(string path) => File.Exists(path) ? File.ReadAllText(path) : null;

    /// <summary>
    /// Writes a text file, creating folders.
    /// </summary>
    /// <param name="path">The path.</param>
    /// <param name="content">The contents.</param>
    public static void WriteText(string path, string content)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content);
    }
}
