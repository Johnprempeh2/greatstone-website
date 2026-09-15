#!/bin/sh
# The standing confidentiality check on a built bundle.
#
# It has caught three real leaks: a client's own tool names used as form placeholder text, a
# hardcoded client slug used as a fallback, and its own blind spot below.
#
# IT SCANS THE WHOLE BUILD, not dist/assets. It used to read only the hashed asset files, so a
# client name in dist/index.html, in a prerendered page, or in any JSON copied into the build
# passed silently while the check printed "clean" and a file count that described a subset. A gate
# that reports on a place it never looked is worse than no gate, because it is believed.
#
# ONE exclusion, by exact string: `application/x-spss-sav` is a registered MIME type. The portal has
# to declare which file formats it accepts, and a format identifier discloses nothing about any
# client. The exclusion is deliberately narrow, so a prose mention of the product still fails.
set -e
cd "$(dirname "$0")/.."
[ -d dist ] || { echo "no dist/ — run: npx vite build"; exit 1; }

# ⚠ THE WORD LIST WAS HAND-MAINTAINED AND HAD ALREADY GONE STALE. It named Indago and its tools and
# people, and missed "Ethical Quest" entirely, which is the other client sitting in the record store
# right now. A gate that only knows the clients somebody remembered to type is a gate that goes
# quiet exactly when a NEW client is onboarded, which is when it matters most. So the store's own
# records supply their names, and the hand list keeps only what is NOT derivable from a record:
# a client's tools and the people around them.
NAMED='smartsurvey\|spss\|gordon\|martyn'
RECORDS="${DEEPDIVE_DIR:-$HOME/Desktop/Code/.greatstone-records}"

# Slugs and client names out of every record. A name becomes a pattern whose spaces match any
# punctuation, so "Ethical Quest", "ethical-quest" and "ethicalquest.com" are all one check.
# ⚠ SINGLE WORDS ARE NOT DERIVED. "quest" appears 582 times in a clean build, inside "request": a
# word list built by splitting names would be red forever and then ignored forever.
derived=''
if [ -d "$RECORDS" ]; then
  derived=$(cat "$RECORDS"/*.json 2>/dev/null \
    | grep -o '"\(client\|slug\)"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | sed 's/.*:[[:space:]]*"//; s/"$//' \
    | tr 'A-Z' 'a-z' \
    | sed 's/[^a-z0-9]\{1,\}/[^a-z0-9]*/g' \
    | sort -u | tr '\n' '|' | sed 's/|$//')
  # ⚠ A derivation that silently yields nothing is the blind gate this file exists to warn about.
  if [ -z "$derived" ]; then
    echo "LEAK CHECK CANNOT RUN — $RECORDS exists but no client names could be read from it."
    exit 1
  fi
fi

WORDS="$NAMED"
[ -n "$derived" ] && WORDS="$WORDS\|$(printf '%s' "$derived" | sed 's/|/\\|/g')"
found=''
n=0
# Every regular file in the build. Binary files are skipped by grep -I, which is what we want:
# a client name in a PNG is not a thing this can check for, and pretending otherwise is the bug
# this rewrite exists to fix.
for f in $(find dist -type f | sort); do
  n=$((n + 1))
  hits=$(sed 's|application/x-spss-sav||g' "$f" 2>/dev/null | grep -Ioi "$WORDS" | sort -u | tr '\n' ' ' || true)
  [ -n "$hits" ] && found="$found\n  $f: $hits"
done

if [ -n "$found" ]; then
  printf 'LEAK — client content in the build:%b\n' "$found"
  exit 1
fi
# and nothing that holds a record may ever be copied into a build
#
# ⚠ THIS CHECK USED TO BE `ls a b c >/dev/null 2>&1`, WHICH FIRED ONLY IF ALL THREE EXISTED. `ls`
# returns failure when ANY argument is missing, so with a record directory actually copied in (one
# path present, the other two absent) the condition was FALSE and the gate printed "clean". The
# realistic leak was the one shape it could not see. Found by planting dist/deepdive/ and watching
# it pass: the same blind-spot bug this file's own header describes, in the half nobody re-tested.
#
# Each path is now asked about on its own, and the <slug>.files case is a real search rather than a
# glob that silently stays literal when it matches nothing.
for p in dist/deepdive dist/.greatstone-records; do
  if [ -e "$p" ]; then
    echo "LEAK — $p was copied into dist/"
    exit 1
  fi
done
if find dist -maxdepth 2 -name '*.files' | grep -q .; then
  echo "LEAK — an attachments directory was copied into dist/"
  exit 1
fi
# ⚠ SAY WHICH MODE IT RAN IN. The client names come from the record store, which is deliberately
# outside this repo, so on a machine without one (a clean clone, or CI) the gate can only check the
# hand-named words and CANNOT know about any client. That is an acceptable limit and an unacceptable
# thing to leave unsaid: an unqualified "clean" from the weaker run reads exactly like the full one.
if [ -n "$derived" ]; then
  echo "clean: no client content across $n built files (checked against $(printf '%s' "$derived" | tr '|' '\n' | wc -l | tr -d ' ') client names from the record store)"
else
  echo "clean: no client content across $n built files — NAMED WORDS ONLY, no record store at $RECORDS, so no client name was checked"
fi
