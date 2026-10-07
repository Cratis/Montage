// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using AspNetCoreArcBuilderExtensions = Microsoft.AspNetCore.Builder.ArcBuilderExtensions;
using Microsoft.Extensions.FileProviders;
using Motion;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.local.json", optional: true, reloadOnChange: false);

builder.Services.AddOptions<MotionOptions>().BindConfiguration("Cratis:Motion").ValidateDataAnnotations();

builder.Services.AddSingleton<Motion.Shows.Packaging.IShowPackager, Motion.Shows.Packaging.ShowPackager>();
builder.Services.AddSingleton<Motion.Shows.Packaging.IFfmpeg, Motion.Shows.Packaging.Ffmpeg>();
builder.Services.AddSingleton<Motion.Shows.Rendering.IVideoRenderer, Motion.Shows.Rendering.EngineRenderer>();
builder.Services.AddSingleton<Motion.Speech.ISpeechSynthesizer, Motion.Speech.SpeechSynthesizer>();
builder.Services.AddSingleton<Motion.Speech.ISpeechTranscriber, Motion.Speech.SpeechTranscriber>();

builder = builder
    .AddCratisArc(
        configureOptions: options =>
        {
            options.GeneratedApis.RoutePrefix = "api";
            options.GeneratedApis.SegmentsToSkipForRoute = 1;
        },
        configureBuilder: arcBuilder => AspNetCoreArcBuilderExtensions.WithChronicle(arcBuilder))
    .AddCratisChronicle(options =>
    {
        options.EventStore = "Motion";
    });
builder.UseCratisMongoDB();
builder.Services.AddControllers();
builder.Services.AddMvc();
builder.Services.AddSwaggerGen(options => options.AddConcepts());
builder.Services.Configure<Microsoft.AspNetCore.Mvc.ApiBehaviorOptions>(_ => _.SuppressModelStateInvalidFilter = true);

var app = builder.Build();

app.UseRouting();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseWebSockets();
app.MapControllers();
app.UseCratisArc();
app.UseCratisChronicle();

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "Motion");
});

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

app.MapFallbackToFile("/index.html");

await app.RunAsync();

