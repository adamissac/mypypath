#!/bin/sh
# Regenerate Python for Data from its content modules, then run the three
# post-passes every generated page needs. build-data-course.cjs clones its head
# from a Foundations lesson, so without these the pages carry that lesson's
# og/canonical tags and lose their header, footer and noscript notice.
set -e
node scripts/build-data-course.cjs
python3 scripts/bake_layout.py
python3 scripts/build-meta.py --apply
python3 scripts/build-noscript.py --apply
