// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

var builder = DistributedApplication.CreateBuilder(args);

// MongoDB the way Chronicle needs it - a self-initiating single-node replica set exposed through a
// connection string with directConnection=true. Chronicle relies on transactions and change streams,
// which a standalone mongod does not support. The same instance backs Motion's Arc read models.
// Pinned to MongoDB 7: MongoDB 8 refuses to start on Linux kernel 6.19 and newer, which current
// Docker Desktop VMs run, and Chronicle then crashes on its missing store.
var mongodb = builder.AddCratisChronicleMongoDB(imageTag: "7.0");

// Chronicle - the slim development image against the MongoDB above, pinned to the same version the
// Cratis.Chronicle client package is pinned to in Directory.Packages.props. The two are a lockstep
// pair: the client validates the kernel's whole service surface on connect, so a floating tag can
// pair a client with a kernel it refuses, and locally that looks like the app simply not starting.
// The client connects over TLS on the single Chronicle port, so it is exposed as a plain TCP endpoint
// with a fixed host port; an Aspire HTTP endpoint would proxy at the HTTP layer and reset the TLS
// handshake.
var chronicle = builder
    .AddContainer("chronicle", "cratis/chronicle", "19.33.3-development-slim")
    .WithEndpoint(port: 35000, targetPort: 35000, name: "grpc")
    .WithEnvironment("Cratis__Chronicle__Storage__Type", "MongoDB")
    .WithEnvironment(context => context.EnvironmentVariables["Cratis__Chronicle__Storage__ConnectionDetails"] = mongodb.Resource.ConnectionStringExpression);

// Chronicle takes a while to come up (patches, authentication setup). The client does not fully
// recover a command pipeline that raced a failed first connection, so gate the editor on the kernel
// actually answering - any HTTP response over TLS on the single Chronicle port will do.
var chronicleReady = builder
    .AddContainer("chronicle-ready", "curlimages/curl", "8.10.1")
    .WithArgs("sh", "-c", "until curl -ks https://chronicle:35000/ -o /dev/null; do sleep 1; done")
    .WaitFor(chronicle);

// Speech services the pipeline is built around: Kokoro-FastAPI speaks the voiceover
// (OpenAI-compatible /v1/audio/speech, model baked into the image) and Speaches aligns it
// word by word (OpenAI-compatible /v1/audio/transcriptions on faster-whisper). Fixed host
// ports so the Cratis:Motion defaults in appsettings.json work without configuration; the
// transcriber downloads its model on first use, cached in a volume the compose file shares.
var tts = builder
    .AddContainer("tts", "ghcr.io/remsky/kokoro-fastapi-cpu", "v0.9.0")
    .WithEndpoint(port: 8880, targetPort: 8880, name: "http");

var stt = builder
    .AddContainer("stt", "ghcr.io/speaches-ai/speaches", "0.9.0-rc.3-cpu")
    .WithEndpoint(port: 8770, targetPort: 8000, name: "http")
    .WithEnvironment("WHISPER__MODEL", "Systran/faster-whisper-tiny.en")
    .WithVolume("motion-hf-cache", "/home/ubuntu/.cache/huggingface/hub");

// The editor frontend - Vite dev server over the .frontend folder inside the editor project, same
// layout as Direct's. Fixed host port so proxy configuration in vite.config.ts keeps resolving /api.
var frontend = builder
    .AddViteApp("motion-frontend", "../Motion")
    .WithEndpoint("http", endpoint => endpoint.Port = 9000)
    .WithViteConfig(".frontend/vite.config.ts");

// The editor backend. TTS, STT and the language model default to the mock services documented in
// the README; point them at real services with appsettings.local.json or user secrets - the app
// reads them through the same Cratis:Motion options it always has.
builder
    .AddProject<Projects.Motion>("motion")
    .WithEndpoint("http", endpoint => endpoint.Port = 5000)
    .WithEnvironment("Cratis__Chronicle__ConnectionString", "chronicle://localhost:35000")
    .WithEnvironment("Cratis__MongoDB__Server", mongodb.Resource.ConnectionStringExpression)
    .WaitFor(tts)
    .WaitFor(stt)
    .WaitFor(chronicle)
    .WaitForCompletion(chronicleReady);

frontend.WaitFor(chronicle);

await builder.Build().RunAsync();
