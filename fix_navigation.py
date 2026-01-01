#!/usr/bin/env python3
import os
import re
from pathlib import Path

# Correct navigation HTML
correct_nav = '''          <ul class="menu">
            <li><a href="/">Home</a></li>
            <li class="has-dropdown">
              <button class="dropdown-toggle" aria-haspopup="true" aria-expanded="false">Units</button>
              <ul class="dropdown" role="menu">
                <li role="none"><a role="menuitem" href="/units/unit-1.html">Unit 1</a></li>
                <li role="none"><a role="menuitem" href="/units/unit-2.html">Unit 2</a></li>
                <li role="none"><a role="menuitem" href="/units/unit-3.html">Unit 3</a></li>
                <li role="none"><a role="menuitem" href="/units/unit-4.html">Unit 4</a></li>
                <li role="none"><a role="menuitem" href="/units/unit-5.html">Unit 5</a></li>
                <li role="none"><a role="menuitem" href="/units/unit-6.html">Unit 6</a></li>
                <li role="none"><a role="menuitem" href="/units/unit-7.html">Unit 7</a></li>
                <li role="none"><a role="menuitem" href="/units/unit-8.html">Unit 8</a></li>
                <li role="none"><a role="menuitem" href="/units/unit-9.html">Unit 9</a></li>
                <li role="none"><a role="menuitem" href="/units/unit-10.html">Unit 10</a></li>
              </ul>
            </li>
            <li><a href="/sandbox.html">Sandbox</a></li>
            <li><a href="/certifications.html">Certifications</a></li>
            <li><a href="/about.html">About</a></li>
            <li><a href="/settings.html">Settings</a></li>
          </ul>'''

# Files that need fixing
files_to_fix = [
    "units/unit-7/introduction-file-handling.html",
    "units/unit-1/first-program.html",
    "units/unit-1/arithmetic-expressions.html",
    "units/unit-1/comments-docs.html",
    "units/unit-1/type-io.html",
    "units/unit-1/syntax-indentation.html",
    "units/unit-1/variables-types.html",
    "units/unit-6/inheritance-subclasses.html",
    "units/unit-6/super-function.html",
    "units/unit-6/oop-real-projects.html",
    "units/unit-6/instance-variables-methods.html",
    "units/unit-6/creating-using-objects.html",
    "units/unit-6/introduction-oop-concepts.html",
    "units/unit-6/encapsulation-access-control.html",
    "units/unit-6/defining-creating-classes.html",
    "units/unit-6/polymorphism-method-overriding.html",
    "units/unit-6/class-variables-class-methods.html",
    "units/unit-3/parameters-arguments.html",
    "units/unit-3/defining-calling-functions.html",
    "units/unit-3/default-optional-parameters.html",
    "units/unit-3/variable-scope-lifetime.html",
    "units/unit-3/practical-function-examples.html",
    "units/unit-3/lambda-functions.html",
    "units/unit-3/what-are-functions.html",
    "units/unit-3/docstrings-documentation.html",
    "units/unit-3/return-statements.html",
    "units/unit-3/nested-helper-functions.html",
    "units/unit-4/indexing-slicing-lists.html",
    "units/unit-4/lists-operations.html",
    "units/unit-4/copying-comparing-structures.html",
    "units/unit-4/tuples-immutable.html",
    "units/unit-4/choosing-right-structure.html",
    "units/unit-4/sets-unique-collections.html",
    "units/unit-4/introduction-data-structures.html",
    "units/unit-4/nested-lists-2d.html",
    "units/unit-4/dictionaries-key-value.html",
    "units/unit-4/dictionary-methods-iteration.html",
    "units/unit-5/virtual-environments.html",
    "units/unit-5/importing-builtin-modules.html",
    "units/unit-5/module-aliases-selective-imports.html",
    "units/unit-5/installing-external-packages.html",
    "units/unit-5/project-organization-best-practices.html",
    "units/unit-5/python-standard-library.html",
    "units/unit-5/creating-your-own-modules.html",
    "units/unit-5/what-are-modules.html",
    "units/unit-5/name-main-pattern.html",
    "units/unit-5/working-with-packages.html",
    "units/unit-2/introduction-loops.html",
    "units/unit-2/comparison-logical-operators.html",
    "units/unit-2/nested-conditionals.html",
    "units/unit-2/practical-control-flow-examples.html",
    "units/unit-2/loop-control-statements.html",
    "units/unit-2/understanding-control-flow.html",
    "units/unit-2/for-loop.html",
    "units/unit-2/boolean-logic-practice.html",
    "units/unit-2/while-loop.html",
    "units/unit-2/if-statement.html",
    "units/unit-2/if-else-elif.html",
]

def fix_navigation(file_path):
    """Fix navigation in a single file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Pattern to match the menu section
        # Match from <ul class="menu"> to </ul> before </nav>
        pattern = r'(<ul class="menu">.*?</ul>)(\s*</nav>)'
        
        # Check if file needs fixing (doesn't have Certifications or About)
        if 'Certifications' in content and 'About' in content:
            print(f"✓ {file_path} already has complete navigation")
            return False
        
        # Replace the menu section
        new_content = re.sub(pattern, correct_nav + r'\2', content, flags=re.DOTALL)
        
        if new_content != content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"✓ Fixed {file_path}")
            return True
        else:
            print(f"✗ Could not fix {file_path} - pattern not found")
            return False
    except Exception as e:
        print(f"✗ Error fixing {file_path}: {e}")
        return False

if __name__ == "__main__":
    base_dir = Path(__file__).parent
    fixed_count = 0
    
    for file_path in files_to_fix:
        full_path = base_dir / file_path
        if full_path.exists():
            if fix_navigation(full_path):
                fixed_count += 1
        else:
            print(f"✗ File not found: {file_path}")
    
    print(f"\n✓ Fixed {fixed_count} files")

