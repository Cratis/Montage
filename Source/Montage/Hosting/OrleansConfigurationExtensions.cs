// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System.Text.Json;
using Cratis.Json;
using Cratis.Orleans.Chronicle.Hosting;
using Cratis.Orleans.Hosting;
using Cratis.Orleans.Setup;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Driver;
using Orleans.Hosting;
using Orleans.Serialization;

namespace Montage.Hosting;

/// <summary>
/// Extension methods for co-hosting Montage's Orleans silo.
/// </summary>
/// <remarks>
/// Montage co-hosts a single silo in-process with localhost clustering - every pipeline stage is a
/// durable job grain, so the silo is not optional the way it is in Direct and Studio. The silo's
/// shared concerns - clustering, the MongoDB client, concept serialization, the job system's
/// grain-storage providers and the reminder service decision - come from
/// <see cref="CratisOrleansSiloBuilderExtensions.AddCratisOrleans"/>. Montage supplies the MongoDB
/// implementation those providers resolve and the JSON fallback for its own records crossing a
/// grain boundary.
/// </remarks>
public static class OrleansConfigurationExtensions
{
    /// <summary>
    /// Adds the co-hosted Orleans silo.
    /// </summary>
    /// <param name="builder">The <see cref="WebApplicationBuilder"/> to configure.</param>
    /// <returns>The same <see cref="WebApplicationBuilder"/> for chaining.</returns>
    public static WebApplicationBuilder AddMontageOrleans(this WebApplicationBuilder builder)
    {
        var connectionString = builder.Configuration["Cratis:MongoDB:Server"] ?? "mongodb://localhost:27017";

        builder.AddCratisOrleans(new CratisOrleansOptions
        {
            ClusterId = "montage",
            ServiceId = "montage",
            Clustering = ClusteringMode.Localhost
        });

        builder.Host.UseOrleans(silo =>
        {
            // A plan JSON document or a voice request inside a job's durable state crosses grain
            // boundaries as plain Montage types; route everything in this application's own namespace
            // through System.Text.Json with a concept converter, the same arrangement Cratis.Orleans
            // gives its own namespaces, extended to Montage's.
            var jsonOptions = new JsonSerializerOptions();
            jsonOptions.Converters.Add(new ConceptAsJsonConverterFactory());
            silo.Services.AddSerializer(serializer => serializer.AddJsonSerializer(
                type => type.Namespace?.StartsWith("Montage", StringComparison.Ordinal) ?? false,
                jsonOptions));

            // The Cratis.Orleans packages install the job grain-storage providers, but the hosting
            // application owns the actual MongoDB implementation they resolve. Without this, a first
            // job start fails resolving IJobsStorage rather than reporting a normal job outcome.
            silo.Services.AddCratisOrleansMongoDBJobsStorage(new MongoClient(connectionString));
        });

        return builder;
    }
}
