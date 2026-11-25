#!/usr/bin/env python3
"""Generate MP3 recordings for the listening clips of the model tests.

Every audio stimulus in data/tests/test-*.json is read aloud with Piper, an
open-source neural text-to-speech engine that runs offline. Male speakers
(`"voice": "m"`) and female speakers (`"voice": "f"`) get different voices.
The MP3 is written to assets/audio/<test>/<part>-<stimulus>.mp3 and the
stimulus's `audio` field is set to that path, which makes the site play the
recording instead of the browser's computer voice.

One-time setup (Python 3.9 or newer, plus ffmpeg on the PATH):

    python3 -m venv .venv && .venv/bin/pip install piper-tts
    .venv/bin/python -m piper.download_voices --data-dir .voices \\
        de_DE-thorsten-high de_DE-kerstin-medium

Run from the repository root:

    .venv/bin/python scripts/generate_audio.py --voices-dir .voices            # new clips only
    .venv/bin/python scripts/generate_audio.py --voices-dir .voices --force    # regenerate all
    .venv/bin/python scripts/generate_audio.py --voices-dir .voices data/tests/test-5.json
    .venv/bin/python scripts/generate_audio.py --dry-run   # show the text as it will be spoken

The two default voices are published under CC0, so the recordings may be
published with the site. To use other voices, change VOICES below.
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
import wave

# Voice model per speaker gender, and its speaking speed (higher = slower).
VOICES = {
    "m": {"model": "de_DE-thorsten-high", "length_scale": 1.15},
    "f": {"model": "de_DE-kerstin-medium", "length_scale": 1.18},
}
PAUSE_BETWEEN_SPEAKERS = 0.55   # seconds of silence between turns
PAUSE_AT_START = 0.4
MP3_BITRATE = "56k"             # mono speech; about 0.4 MB per minute

# ----------------------------------------------------------------- text clean-up
# The speech engine misreads some written forms, so they are spelled out first.

ABBREVIATIONS = [
    (r"\bz\.\s?B\.", "zum Beispiel"), (r"\bd\.\s?h\.", "das heißt"), (r"\bu\.\s?a\.", "unter anderem"),
    (r"\bbzw\.", "beziehungsweise"), (r"\busw\.", "und so weiter"), (r"\bca\.", "circa"),
    (r"\bggf\.", "gegebenenfalls"), (r"\bevtl\.", "eventuell"), (r"\binkl\.", "inklusive"),
    (r"\bNr\.", "Nummer"), (r"\bDr\.", "Doktor"), (r"\bTel\.", "Telefon"), (r"\bStr\.", "Straße"),
]
DIGITS = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun"]
# Ordinal stems that are not simply the number word + "t".
ORDINAL_STEMS = {1: "erst", 3: "dritt", 7: "siebt", 8: "acht"}
CARDINALS = ["", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf",
             "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"]
TENS = {20: "zwanzig", 30: "dreißig"}
MONTHS = "Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember"
# Words after which a number with a full stop is a date ("am 3.", "bis zum 12.").
DATE_WORDS_DATIVE = "am|vom|zum|beim|dem|den|ab|seit|bis|nach|vor"


def ordinal(n, ending):
    """German ordinal word for 1-31, e.g. (14, "en") -> "vierzehnten", (21, "e") -> "einundzwanzigste"."""
    if n in ORDINAL_STEMS:
        return ORDINAL_STEMS[n] + ending
    if n < 20:
        return CARDINALS[n] + "t" + ending
    tens, unit = (n // 10) * 10, n % 10
    return (CARDINALS[unit] + "und" if unit else "") + TENS[tens] + "st" + ending


def speak_ordinals(text):
    def repl(m):
        before, num, after = m.group(1) or "", int(m.group(2)), m.group(3) or ""
        if not 1 <= num <= 31:
            return m.group(0)
        nominative = before.strip().lower() in ("der", "ist der", "heute ist der")
        return before + ordinal(num, "e" if nominative else "en") + after
    # "14. Mai", with an optional word before it that decides the ending
    text = re.sub(r"(\b(?:[Dd]er|%s)\s+)?(\d{1,2})\.(\s+(?:%s)\b)" % (DATE_WORDS_DATIVE, MONTHS), repl, text)
    # "am 3." / "bis zum 12." without a month
    text = re.sub(r"(\b(?:[Aa]m|[Vv]om|[Zz]um)\s+)(\d{1,2})\.()", repl, text)
    return text


def speak_phone_numbers(text):
    def repl(m):
        groups = re.split(r"[ /-]+", m.group(0).strip())
        return ", ".join(" ".join(DIGITS[int(d)] for d in g) for g in groups)
    return re.sub(r"\b0\d{2,5}(?:[ /-]\d{2,}){1,5}\b", repl, text)


def normalise(text):
    for pattern, replacement in ABBREVIATIONS:
        text = re.sub(pattern, replacement, text)
    text = speak_phone_numbers(text)
    text = speak_ordinals(text)
    # Names spelled out letter by letter: "M-O-K-O-E-N-A" -> "M, O, K, O, E, N, A"
    text = re.sub(r"\b[A-ZÄÖÜ](?:-[A-ZÄÖÜ]){2,}\b", lambda m: ", ".join(m.group(0).split("-")), text)
    return text


# ----------------------------------------------------------------- synthesis

def audio_clips(test):
    for section in test["sections"]:
        for part in section["parts"]:
            for stim in part.get("stimuli", []):
                if stim.get("kind") == "audio":
                    yield part, stim


def synthesise(stim, voices, out_path, workdir):
    """Speak every transcript line with its speaker's voice and join the lines into one MP3."""
    from piper import SynthesisConfig
    inputs, filters = [], []
    for i, line in enumerate(stim["transcript"]):
        spec = VOICES[line["voice"]]
        wav_path = os.path.join(workdir, "line%03d.wav" % i)
        with wave.open(wav_path, "wb") as wav:
            voices[line["voice"]].synthesize_wav(normalise(line["text"]), wav,
                                                 syn_config=SynthesisConfig(length_scale=spec["length_scale"]))
        inputs += ["-i", wav_path]
        pause = PAUSE_AT_START if i == 0 else PAUSE_BETWEEN_SPEAKERS
        # Same sample rate and loudness for every voice, with silence in front of each turn.
        filters.append("[%d:a]aresample=22050,loudnorm=I=-18:TP=-2:LRA=11,aresample=22050,adelay=%d[a%d]"
                       % (i, int(pause * 1000), i))
    n = len(stim["transcript"])
    graph = ";".join(filters) + ";" + "".join("[a%d]" % i for i in range(n)) + "concat=n=%d:v=0:a=1,apad=pad_dur=0.4[out]" % n
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error"] + inputs +
                   ["-filter_complex", graph, "-map", "[out]", "-ac", "1", "-b:a", MP3_BITRATE,
                    "-map_metadata", "-1", out_path], check=True)


def main():
    parser = argparse.ArgumentParser(description="Generate listening MP3s for the model tests.")
    parser.add_argument("tests", nargs="*", help="test files (default: all data/tests/test-*.json)")
    parser.add_argument("--voices-dir", default=".voices", help="folder with the downloaded Piper voices")
    parser.add_argument("--force", action="store_true", help="regenerate clips that already exist")
    parser.add_argument("--dry-run", action="store_true", help="only print lines whose text is changed before speaking")
    args = parser.parse_args()
    files = args.tests or sorted(glob.glob("data/tests/test-*.json"))

    if args.dry_run:
        for path in files:
            with open(path, encoding="utf-8") as fh:
                for _, stim in audio_clips(json.load(fh)):
                    for line in stim["transcript"]:
                        spoken = normalise(line["text"])
                        if spoken != line["text"]:
                            print("%s %s\n   written: %s\n   spoken:  %s" % (path, stim["id"], line["text"], spoken))
        return 0

    from piper import PiperVoice
    voices = {g: PiperVoice.load(os.path.join(args.voices_dir, spec["model"] + ".onnx")) for g, spec in VOICES.items()}

    for path in files:
        with open(path, encoding="utf-8") as fh:
            test = json.load(fh)
        for part, stim in audio_clips(test):
            rel = "assets/audio/%s/%s-%s.mp3" % (test["id"], part["id"], stim["id"])
            if args.force or not os.path.isfile(rel):
                with tempfile.TemporaryDirectory() as workdir:
                    synthesise(stim, voices, rel, workdir)
                print("wrote", rel)
            stim["audio"] = rel
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(test, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
