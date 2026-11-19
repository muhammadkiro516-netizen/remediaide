#!/bin/bash
# MAP - Charting Student Math Misunderstandings (Kaggle, MIT). Needs the Kaggle CLI logged in and the
# competition rules accepted: https://www.kaggle.com/competitions/map-charting-student-math-misunderstandings
# An unmodified copy of train.csv is also shipped in data/original/map/ of the submission package.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p raw/map
kaggle competitions download -c map-charting-student-math-misunderstandings -p raw/map
unzip -o raw/map/map-charting-student-math-misunderstandings.zip -d raw/map
echo "expected sha256 train.csv: f347a34f62be3b1bc188b11290f5615b5bf050a7b7c3aeb21b1966feed7615a0"; shasum -a 256 raw/map/train.csv
