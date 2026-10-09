// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

var builder = DistributedApplication.CreateBuilder(args);

// MongoDB the way Chronicle needs it - a self-initiating single-node replica set exposed through a
// connection string with directConnection=true. Chronicle relies on transactions and change streams,
// which a standalone mongod does not support. The same instance backs Montage's Arc read models.
// Pinned to MongoDB 7: MongoDB 8 refuses to start on Linux kernel 6.19 and newer, which current
// Docker Desktop VMs run, and Chronicle then crashes on its missing store.
var mongodb = builder.AddCratisChronicleMongoDB(imageTag: "7.0");

// Pin the host port to match the replica set's own member name (the entrypoint initiates rs0
// as localhost:27017, the container's internal port). Without this the container gets a random
// host port, the editor's MongoDB client on the host races a member name it cannot reach, and
// every read-model query times out on a cold boot. Fixed port = the injected connection string
// is exactly mongodb://localhost:27017/?directConnection=true, same as appsettings defaults.
var mongodbServer = builder.Resources.OfType<ContainerResource>().Single(_ => _.Name == "mongodb-server");
builder.CreateResourceBuilder(mongodbServer).WithEndpoint("tcp", endpoint => endpoint.Port = 27017);

// A named volume so the event store, read models and configured providers survive an AppHost
// restart - an anonymous volume dies with the container, and every restart then wiped every
// provider and show the user had. The seeder is idempotent, so a populated store is safe.
builder.CreateResourceBuilder(mongodbServer).WithVolume("montage-mongodb-data", "/data/db");

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
    .WithEnvironment(context => context.EnvironmentVariables["Cratis__Chronicle__Storage__ConnectionDetails"] = mongodb.Resource.ConnectionStringExpression)

    // The pipeline's stages legitimately run long (a render takes minutes) and always answer —
    // success or a failure event — so the subscriber waits indefinitely instead of timing out.
    .WithEnvironment("Cratis__Chronicle__Observers__SubscriberTimeout", "0");

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
// ports so the Cratis:Montage defaults in appsettings.json work without configuration; the
// transcriber downloads its model on first use, cached in a volume the compose file shares.
var tts = builder
    .AddContainer("tts", "ghcr.io/remsky/kokoro-fastapi-cpu", "v0.9.0")

    // lambda form: the parameter form leaves the host port dynamic, which silently sends the
    // editor to whatever else listens on the configured port (the mock services) instead
    .WithEndpoint("http", endpoint =>
    {
        endpoint.Port = 8880;
        endpoint.TargetPort = 8880;
    });

// Kokoro loads its model lazily on the first speech request, and the first requests after a
// container start can come back near-silent — so gate the editor on a warm-up synthesis (the
// same trick as chronicle-ready, with the side effect that the model is resident before the
// first real scene is spoken).
var ttsReady = builder
    .AddContainer("tts-ready", "curlimages/curl", "8.10.1")
    .WithArgs("sh", "-c", "until curl -sf -m 30 -X POST http://tts:8880/v1/audio/speech -H 'Content-Type: application/json' -d '{\"model\":\"kokoro\",\"input\":\"ready\",\"voice\":\"af_heart\",\"response_format\":\"wav\",\"stream\":false}' -o /dev/null; do sleep 2; done")
    .WaitFor(tts);

var stt = builder
    .AddContainer("stt", "ghcr.io/speaches-ai/speaches", "0.9.0-rc.3-cpu")
    .WithEndpoint("http", endpoint =>
    {
        endpoint.Port = 8770;
        endpoint.TargetPort = 8000;
    })
    .WithEnvironment("WHISPER__MODEL", "Systran/faster-whisper-tiny.en")
    .WithVolume("montage-hf-cache", "/home/ubuntu/.cache/huggingface/hub");

// The editor frontend - Vite dev server over the .frontend folder inside the editor project, same
// layout as Direct's. Fixed host port so proxy configuration in vite.config.ts keeps resolving /api.
var frontend = builder
    .AddViteApp("montage-frontend", "../Montage")
    .WithEndpoint("http", endpoint => endpoint.Port = 9000)
    .WithViteConfig(".frontend/vite.config.ts");

// The editor backend. TTS, STT and the language model default to the mock services documented in
// the README; point them at real services with appsettings.local.json or user secrets - the app
// reads them through the same Cratis:Montage options it always has.
builder
    .AddProject<Projects.Montage>("montage")
    .WithEndpoint("http", endpoint => endpoint.Port = 5000)
    .WithEnvironment("Cratis__Chronicle__ConnectionString", "chronicle://localhost:35000")
    .WithEnvironment("Cratis__MongoDB__Server", mongodb.Resource.ConnectionStringExpression)

    // the speech containers get dynamic host ports, so hand the editor their allocated
    // endpoints (services__*__http__0) - Montage prefers them over the configured defaults
    .WithEnvironment(context =>
    {
        context.EnvironmentVariables["services__tts__http__0"] = tts.GetEndpoint("http");
        context.EnvironmentVariables["services__stt__http__0"] = stt.GetEndpoint("http");
    })
    .WaitFor(tts)
    .WaitFor(stt)
    .WaitFor(chronicle)
    .WaitForCompletion(chronicleReady)
    .WaitForCompletion(ttsReady);

frontend.WaitFor(chronicle);

await builder.Build().RunAsync();
