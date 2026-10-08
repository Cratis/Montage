// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using Cratis.AI.Configuration;
using Microsoft.Extensions.FileProviders;
using Motion;
using Motion.Hosting;
using AspNetCoreArcBuilderExtensions = Microsoft.AspNetCore.Builder.ArcBuilderExtensions;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.local.json", optional: true, reloadOnChange: false);

builder.Services.AddOptions<MotionOptions>().BindConfiguration("Cratis:Motion").ValidateDataAnnotations();

builder.Services.AddSingleton<Motion.Shows.Packaging.IShowPackager, Motion.Shows.Packaging.ShowPackager>();
builder.Services.AddSingleton<Motion.Shows.Packaging.IFfmpeg, Motion.Shows.Packaging.Ffmpeg>();
builder.Services.AddSingleton<Motion.Shows.Rendering.IVideoRenderer, Motion.Shows.Rendering.EngineRenderer>();
builder.Services.AddSingleton<Motion.Shows.Rendering.IEngineStills, Motion.Shows.Rendering.EngineStills>();
builder.Services.AddSingleton<Motion.Speech.ISpeechSynthesizer, Motion.Speech.SpeechSynthesizer>();
builder.Services.AddSingleton<Motion.Speech.ISpeechTranscriber, Motion.Speech.SpeechTranscriber>();

// Must run before AddCratisArc (which snapshots Arc's type universe the first time it is
// touched) - a lazily-loaded Cratis.AI.dll afterwards would contribute its providers, commands
// and queries to that universe silently too late. Motion's one agent seam - the planner - goes
// with it; the providers themselves are configured at runtime through Cratis.AI's own commands.
builder.Services.AddCratisAI(ai => ai
    .WithAgents<Motion.AI.MotionAIAgents>());

builder = builder
    .AddCratisArc(
        configureOptions: options =>
        {
            options.GeneratedApis.RoutePrefix = "api";
            options.GeneratedApis.SegmentsToSkipForRoute = 1;
        },
        configureBuilder: arcBuilder => AspNetCoreArcBuilderExtensions.WithChronicle(arcBuilder))
    .AddCratisChronicle(options => options.EventStore = "Motion");
builder.UseCratisMongoDB();

// After UseCratisMongoDB: the job system's MongoDB storage registers the concrete IMongoClient
// the silo owns, and that registration must be the one that wins - the jobs storage is a
// singleton and cannot consume a scoped client. Same arrangement as Direct's AddDirectOrleans.
builder.AddMotionOrleans();
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
app.UseSwaggerUI(options => options.SwaggerEndpoint("/swagger/v1/swagger.json", "Motion"));

// Serve generated show packages at /packages/{showId}/... so the engine preview can load them.
var motion = app.Services.GetRequiredService<IOptions<MotionOptions>>().Value;
var workspace = motion.WorkspacePathFor(app.Environment.ContentRootPath);
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
var voiceCatalog = new Motion.Speech.VoiceCatalog(
    app.Services.GetRequiredService<Motion.Speech.ISpeechSynthesizer>(),
    app.Services.GetRequiredService<IOptions<MotionOptions>>());
app.MapGet("/api/motion/voices", async () => Results.Json(await voiceCatalog.All()));
app.MapGet("/api/motion/voices/preview", async (string voice) =>
{
    var (contentType, bytes, status, error) = await voiceCatalog.Preview(voice);
    return status == 200 ? Results.File(bytes, contentType) : Results.Problem(error, statusCode: status);
});

app.MapFallbackToFile("/index.html");

await app.RunAsync();

