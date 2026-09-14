"""PyPath adaptive engine: offline skill-mastery modelling and practice recommendation.

Training and evaluation happen here, in Python, offline. The browser never runs
scikit-learn: `export` freezes a logistic model into assets/data/model/, and
assets/js/recommend.js re-implements the scorer and policy in plain JS, pinned to
this package by shared parity fixtures.

Nothing produced here is a grade. The events it learns from are written by each
student's own browser and can be fabricated; see MODEL_CARD.md.
"""
__version__ = "0.1.0"
MODEL_VERSION = "mastery-v1"
