import os
import re
import glob

html_files = glob.glob('*.html')

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Replace the button text
    content = content.replace('Analysis <i class="fa-solid fa-chevron-down"></i>', 'Market Data <i class="fa-solid fa-chevron-down"></i>')
    
    # Check if we already inserted block deals
    if '/block-deals' not in content:
        # We need a robust way to match the desktop and mobile links.
        # Desktop link does NOT have mobile-only. Mobile link DOES have mobile-only.
        # So we can just find them and insert the respective Block Deals links.
        
        # 1. Desktop dropdown:
        content = re.sub(
            r'(<a href="/sector-analysis"(?:(?!mobile-only).)*>Sector Analysis</a>)',
            r'\1\n                        <a href="/block-deals">Block Deals</a>',
            content
        )
        
        # 2. Mobile link:
        content = re.sub(
            r'(<a href="/sector-analysis"[^>]*mobile-only[^>]*>Sector Analysis</a>)',
            r'\1\n                <a href="/block-deals" class="nav-link mobile-only">Block Deals</a>',
            content
        )
        
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print(f"Updated {len(html_files)} HTML files successfully.")
