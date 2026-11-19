#!/bin/bash
# Eedi NeurIPS 2020 Education Challenge (Task 3&4). License CC BY-NC-ND 4.0: do not redistribute modified versions.
# Source: https://eedi.com/projects/neurips-education-challenge  (Wang et al. 2020, arXiv:2007.12061)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p raw/eedi_neurips2020
curl -L -o raw/eedi_neurips2020/data.zip https://dqanonymousdata.blob.core.windows.net/neurips-public/data.zip
echo "expected sha256: c7f01672360f1adeb3cf9507d72455d7be035bf897e4a167293e8938049800e1"
shasum -a 256 raw/eedi_neurips2020/data.zip
