"""Global seeding. Every script/notebook must call set_seed() first."""

import os
import random

import numpy as np

GLOBAL_SEED = 20261118  # fixed for the whole project (docs/cac/DECISIONS.md D-01)
ENSEMBLE_SEEDS = (20261118, 1, 2, 3, 4)


def set_seed(seed: int = GLOBAL_SEED) -> int:
    os.environ["PYTHONHASHSEED"] = str(seed)
    random.seed(seed)
    np.random.seed(seed)
    try:
        import torch

        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
    except ImportError:
        pass
    return seed
