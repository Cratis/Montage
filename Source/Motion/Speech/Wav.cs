// Copyright (c) Cratis. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

// Minimal RIFF/WAVE reading: duration and raw PCM samples for envelope analysis.
// The TTS service returns standard 16-bit PCM WAV — parsing it in-process avoids an
// extra ffmpeg round-trip for the loudness analysis.
using System.Runtime.InteropServices;

namespace Motion.Speech;

/// <summary>
/// Reads PCM WAV files.
/// </summary>
public static class Wav
{
    /// <summary>
    /// Represents the parsed WAV header.
    /// </summary>
    /// <param name="Channels">Channel count.</param>
    /// <param name="SampleRate">Samples per second.</param>
    /// <param name="BitsPerSample">Bits per sample (16 for PCM from the TTS).</param>
    /// <param name="DataLength">Byte length of the data chunk.</param>
    [StructLayout(LayoutKind.Sequential)]
    public readonly record struct Header(int Channels, int SampleRate, int BitsPerSample, int DataLength)
    {
        /// <summary>
        /// Gets the duration in seconds.
        /// </summary>
        public double Duration => (double)DataLength / (Channels * SampleRate * (BitsPerSample / 8));
    }

    /// <summary>
    /// Parses the header of a WAV file.
    /// </summary>
    /// <param name="path">Path of the file.</param>
    /// <returns>The header.</returns>
    public static Header ReadHeader(string path)
    {
        using var stream = File.OpenRead(path);
        return ReadHeader(stream);
    }

    /// <summary>
    /// Parses the header of a WAV stream.
    /// </summary>
    /// <param name="stream">The stream, positioned at the start.</param>
    /// <returns>The header.</returns>
    public static Header ReadHeader(Stream stream)
    {
        using var reader = new BinaryReader(stream, System.Text.Encoding.ASCII, leaveOpen: true);
        var riff = reader.ReadBytes(4);
        if (riff.AsSpan().ToArray() is not [0x52, 0x49, 0x46, 0x46]) throw new InvalidDataException("Not a RIFF file.");
        reader.ReadBytes(4); // file size
        var wave = reader.ReadBytes(4);
        if (wave.AsSpan().ToArray() is not [0x57, 0x41, 0x56, 0x45]) throw new InvalidDataException("Not a WAVE file.");

        int channels = 0, sampleRate = 0, bits = 0, dataLength = 0;
        while (stream.Position < stream.Length - 8)
        {
            var chunkId = new string(reader.ReadChars(4));
            var chunkSize = reader.ReadInt32();
            switch (chunkId)
            {
                case "fmt ":
                    reader.ReadInt16(); // audio format (PCM = 1)
                    channels = reader.ReadInt16();
                    sampleRate = reader.ReadInt32();
                    reader.ReadInt32(); // byte rate
                    reader.ReadInt16(); // block align
                    bits = reader.ReadInt16();
                    if (chunkSize > 16) stream.Position += chunkSize - 16;
                    break;
                case "data":
                    dataLength = chunkSize;
                    stream.Position = stream.Length; // done once we have data
                    break;
                default:
                    stream.Position += chunkSize + (chunkSize & 1); // chunks are word-aligned
                    break;
            }
        }
        return new(channels, sampleRate, bits, dataLength);
    }

    /// <summary>
    /// Gets the duration of a WAV file, in seconds.
    /// </summary>
    /// <param name="path">Path of the file.</param>
    /// <returns>Duration in seconds.</returns>
    public static double ReadDuration(string path) => ReadHeader(path).Duration;

    /// <summary>
    /// Reads the mono sample array (16-bit PCM; stereo is averaged down).
    /// </summary>
    /// <param name="path">Path of the file.</param>
    /// <returns>Samples in -1..1 and the sample rate.</returns>
    public static (float[] Samples, int SampleRate) ReadMonoSamples(string path)
    {
        var header = ReadHeader(path);
        using var stream = File.OpenRead(path);
        using var reader = new BinaryReader(stream);

        // skip to data chunk (past RIFF + WAVE markers)
        stream.Position = 12;
        while (true)
        {
            var chunkId = new string(reader.ReadChars(4));
            var chunkSize = reader.ReadInt32();
            if (chunkId == "data") break;
            stream.Position += chunkSize + (chunkSize & 1);
        }
        var bytes = reader.ReadBytes(header.DataLength);
        var frames = bytes.Length / (header.Channels * 2);
        var samples = new float[frames];
        for (var frame = 0; frame < frames; frame++)
        {
            // average all channels down to mono, little-endian 16-bit
            var acc = 0.0;
            for (var c = 0; c < header.Channels; c++)
            {
                var offset = ((frame * header.Channels) + c) * 2;
                var v = offset + 1 < bytes.Length ? BitConverter.ToInt16(bytes, offset) : (short)0;
                acc += v / 32768f;
            }
            samples[frame] = (float)(acc / header.Channels);
        }
        return (samples, header.SampleRate);
    }
}
