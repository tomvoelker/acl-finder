#!/usr/bin/env python3
import json
import re
import unicodedata

def latex_to_unicode(text):
    """Convert LaTeX sequences to Unicode characters"""
    if not text:
        return text
    
    # LaTeX to Unicode mappings
    latex_mappings = {
        # Combining caron (háček) - \v{}
        r'\\v\{([a-zA-Z])\}': {
            'a': 'ǎ', 'A': 'Ǎ',
            'c': 'č', 'C': 'Č', 
            'd': 'ď', 'D': 'Ď',
            'e': 'ě', 'E': 'Ě',
            'g': 'ǧ', 'G': 'Ǧ',
            'h': 'ȟ', 'H': 'Ȟ',
            'i': 'ǐ', 'I': 'Ǐ',
            'j': 'ǰ', 'J': 'J̌',
            'k': 'ǩ', 'K': 'Ǩ',
            'l': 'ľ', 'L': 'Ľ',
            'n': 'ň', 'N': 'Ň',
            'o': 'ǒ', 'O': 'Ǒ',
            'r': 'ř', 'R': 'Ř',
            's': 'š', 'S': 'Š',
            't': 'ť', 'T': 'Ť',
            'u': 'ǔ', 'U': 'Ǔ',
            'z': 'ž', 'Z': 'Ž'
        },
        
        # Alternative format {\v{letter}}
        r'\{\\v\{([a-zA-Z])\}\}': {
            'a': 'ǎ', 'A': 'Ǎ',
            'c': 'č', 'C': 'Č', 
            'd': 'ď', 'D': 'Ď',
            'e': 'ě', 'E': 'Ě',
            'g': 'ǧ', 'G': 'Ǧ',
            'h': 'ȟ', 'H': 'Ȟ',
            'i': 'ǐ', 'I': 'Ǐ',
            'j': 'ǰ', 'J': 'J̌',
            'k': 'ǩ', 'K': 'Ǩ',
            'l': 'ľ', 'L': 'Ľ',
            'n': 'ň', 'N': 'Ň',
            'o': 'ǒ', 'O': 'Ǒ',
            'r': 'ř', 'R': 'Ř',
            's': 'š', 'S': 'Š',
            't': 'ť', 'T': 'Ť',
            'u': 'ǔ', 'U': 'Ǔ',
            'z': 'ž', 'Z': 'Ž'
        },
        
        # Acute accent - \'{}
        r'\\?\'\{([a-zA-Z])\}': {
            'a': 'á', 'A': 'Á',
            'c': 'ć', 'C': 'Ć',
            'e': 'é', 'E': 'É',
            'i': 'í', 'I': 'Í',
            'l': 'ĺ', 'L': 'Ĺ',
            'n': 'ń', 'N': 'Ń',
            'o': 'ó', 'O': 'Ó',
            'r': 'ŕ', 'R': 'Ŕ',
            's': 'ś', 'S': 'Ś',
            'u': 'ú', 'U': 'Ú',
            'y': 'ý', 'Y': 'Ý',
            'z': 'ź', 'Z': 'Ź'
        },
        
        # German umlaut - \"{}
        r'\\"\{([a-zA-Z])\}': {
            'a': 'ä', 'A': 'Ä',
            'e': 'ë', 'E': 'Ë',
            'i': 'ï', 'I': 'Ï',
            'o': 'ö', 'O': 'Ö',
            'u': 'ü', 'U': 'Ü',
            'y': 'ÿ', 'Y': 'Ÿ'
        }
    }
    
    # Apply each pattern
    for pattern, mappings in latex_mappings.items():
        def replace_match(match):
            letter = match.group(1)
            return mappings.get(letter, match.group(0))
        
        text = re.sub(pattern, replace_match, text)
    
    return text

def create_author_slug(name):
    """Create consistent author slug with Unicode normalization"""
    # First convert LaTeX to Unicode
    unicode_name = latex_to_unicode(name)
    
    # Then normalize and create slug
    slug = unicodedata.normalize('NFKD', unicode_name)
    slug = ''.join(c for c in slug if not unicodedata.combining(c))
    slug = slug.lower()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[-\s]+', '-', slug)
    slug = slug.strip('-')
    
    return slug

def fix_authors_json():
    """Fix LaTeX conversion issues in authors.json"""
    print("Loading authors.json...")
    
    with open('authors.json', 'r', encoding='utf-8') as f:
        authors_data = json.load(f)
    
    print(f"Found {len(authors_data)} authors")
    
    # Find and fix problematic entries
    fixed_authors = {}
    problematic_entries = []
    
    for slug, author_data in authors_data.items():
        original_name = author_data['name']
        
        # Check if name contains LaTeX sequences
        if '\\v{' in original_name or '{\\v{' in original_name:
            problematic_entries.append((slug, original_name))
        
        # Convert LaTeX to Unicode
        fixed_name = latex_to_unicode(original_name)
        
        # Create new slug
        new_slug = create_author_slug(fixed_name)
        
        # Update author data
        new_author_data = author_data.copy()
        new_author_data['name'] = fixed_name
        
        # Also fix names in papers and coauthors
        for paper in new_author_data.get('papers', []):
            if 'coauthors' in paper:
                paper['coauthors'] = [latex_to_unicode(name) for name in paper['coauthors']]
        
        if 'coauthors' in new_author_data:
            new_author_data['coauthors'] = [latex_to_unicode(name) for name in new_author_data['coauthors']]
        
        fixed_authors[new_slug] = new_author_data
    
    print(f"\nFound {len(problematic_entries)} entries with LaTeX issues:")
    for slug, name in problematic_entries:
        fixed_name = latex_to_unicode(name)
        new_slug = create_author_slug(fixed_name)
        print(f"  {slug} -> {new_slug}")
        print(f"    {name} -> {fixed_name}")
    
    # Save fixed data
    print(f"\nSaving fixed authors.json with {len(fixed_authors)} authors...")
    with open('authors.json', 'w', encoding='utf-8') as f:
        json.dump(fixed_authors, f, ensure_ascii=False, indent=2)
    
    print("✅ Fixed authors.json!")
    
    # Test specific case
    if 'goran-glavas' in fixed_authors:
        print(f"\n✅ Goran Glavaš is now available at: goran-glavas")
        print(f"   Name: {fixed_authors['goran-glavas']['name']}")
    else:
        print(f"\n❌ Goran Glavaš not found in fixed data")

if __name__ == "__main__":
    fix_authors_json()