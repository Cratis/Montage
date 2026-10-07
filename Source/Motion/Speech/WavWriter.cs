// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

namespace Motion.Speech;

/// <summary>
/// Reads PCM frames from 16-bit WAV files and writes concatenated WAV files with silence
/// between segments. Synthesized segments share one voice, so their formats match; anything
/// else throws loudly instead of producing garbled audio.
/// </summary>
public static class WavWriter
{
    /// <summary>
    /// Appends one WAV file's PCM data to a target stream.
    /// </summary>
    /// <param name="sourcePath">The source WAV.</param>
    /// <param name="target">The open target stream (a completed WAV when done).</param>
    /// <param name="format">The expected format; captured from the first segment.</param>
    public static void Append(string sourcePath, Stream target, ref (int Channels, int SampleRate)? format)
    {
        var header = Wav.ReadHeader(sourcePath);
        if (format is { } f && (f.Channels != header.Channels || f.SampleRate != header.SampleRate))
        {
            throw new InvalidOperationException($"WAV format mismatch: expected {f.Channels}ch@{f.SampleRate}Hz, got {header.Channels}ch@{header.SampleRate}Hz in {sourcePath}");
        }
        format ??= (header.Channels, header.SampleRate);

        using var source = File.OpenRead(sourcePath);
        var (dataOffset, dataLength) = FindDataChunk(source);
        source.Position = dataOffset;
        var buffer = new byte[64 * 1024];
        while (dataLength > 0)
        {
            var read = source.Read(buffer, 0, Math.Min(buffer.Length, dataLength));
            if (read <= 0) break;
            target.Write(buffer, 0, read);
            dataLength -= read;
        }
    }

    /// <summary>
    /// Appends silence of the given duration to a target stream.
    /// </summary>
    /// <param name="target">The open target stream.</param>
    /// <param name="format">The format (channels, sample rate).</param>
    /// <param name="seconds">How many seconds of silence.</param>
    public static void AppendSilence(Stream target, (int Channels, int SampleRate) format, double seconds)
    {
        var bytesPerFrame = format.Channels * 2;
        var totalBytes = (long)(seconds * format.SampleRate) * bytesPerFrame;
        var buffer = new byte[Math.Min(totalBytes, 64 * 1024)];
        Array.Clear(buffer, 0, buffer.Length);
        while (totalBytes > 0)
        {
            var n = (int)Math.Min(buffer.Length, totalBytes);
            target.Write(buffer, 0, n);
            totalBytes -= n;
        }
    }

    /// <summary>
    /// Finalizes a RIFF/WAVE header at the start of a stream that already holds raw PCM data.
    /// </summary>
    /// <param name="target">A seekable stream positioned anywhere; header is written at 0.</param>
    /// <param name="format">The format.</param>
    public static void Finalize(Stream target, (int Channels, int SampleRate) format)
    {
        var position = target.Length;
        using var writer = new BinaryWriter(target, System.Text.Encoding.ASCII, leaveOpen: true);
        target.Position = 0;
        var dataLength = (int)(position - 44);
        writer.Write("RIFF"u8);
        writer.Write(36 + dataLength);
        writer.Write("WAVE"u8);
        writer.Write("fmt "u8);
        writer.Write(16);
        writer.Write((short)1); // PCM
        writer.Write((short)format.Channels);
        writer.Write(format.SampleRate);
        writer.Write(format.SampleRate * format.Channels * 2);
        writer.Write((short)(format.Channels * 2));
        writer.Write((short)16);
        writer.Write("data"u8);
        writer.Write(dataLength);
        target.Position = position;
    }

    /// <summary>
    /// Prepares a fresh WAV file: writes a placeholder header and returns a stream positioned after it.
    /// </summary>
    /// <param name="destination">The destination path.</param>
    /// <returns>The open stream.</returns>
    public static FileStream Create(string destination)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
        var stream = File.Create(destination);
        stream.SetLength(44); // placeholder header, finalized after the data is written
        stream.Position = 44;
        return stream;
    }

    static (long Offset, int Length) FindDataChunk(Stream stream)
    {
        using var reader = new BinaryReader(stream, System.Text.Encoding.ASCII, leaveOpen: true);
        stream.Position = 12; // past RIFF + WAVE
        while (stream.Position < stream.Length - 8)
        {
            var chunkId = new string(reader.ReadChars(4));
            var chunkSize = reader.ReadInt32();
            if (chunkId == "data")
            {
                // Streaming WAV writers emit 0xFFFFFFFF (-1) for unknown sizes; the data is
                // then everything after the header.
                var length = chunkSize > 0 ? chunkSize : (int)(stream.Length - stream.Position);
                return (stream.Position, length);
            }
            stream.Position += chunkSize + (chunkSize & 1);
        }
        throw new InvalidDataException("No data chunk in WAV file.");
    }
}
