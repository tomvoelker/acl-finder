#!/usr/bin/env python3
import xml.etree.ElementTree as ET
import requests
import json
import re
from typing import List, Dict, Any

def download_acl_xml(year: int = 2025) -> str:
    """Download ACL XML file from GitHub repository."""
    url = f"https://raw.githubusercontent.com/acl-org/acl-anthology/master/data/xml/{year}.acl.xml"
    
    print(f"Downloading {url}...")
    response = requests.get(url)
    response.raise_for_status()
    
    return response.text

def clean_text(text: str) -> str:
    """Clean text by removing extra whitespace and normalizing."""
    if not text:
        return ""
    
    # Remove extra whitespace and normalize
    text = re.sub(r'\s+', ' ', text.strip())
    return text

def extract_authors(paper_elem) -> List[Dict[str, str]]:
    """Extract author information from paper element."""
    authors = []
    
    for author_elem in paper_elem.findall('author'):
        first_name = author_elem.find('first')
        last_name = author_elem.find('last')
        
        if first_name is not None and last_name is not None:
            author = {
                'first': clean_text(first_name.text or ''),
                'last': clean_text(last_name.text or ''),
                'full_name': f"{clean_text(first_name.text or '')} {clean_text(last_name.text or '')}".strip()
            }
            
            # Add affiliation if available
            affiliation = author_elem.find('affiliation')
            if affiliation is not None and affiliation.text:
                author['affiliation'] = clean_text(affiliation.text)
            
            authors.append(author)
    
    return authors

def generate_author_slug(authors: List[Dict[str, str]]) -> str:
    """Generate author slug for paper identification."""
    if not authors:
        return "unknown"
    
    # Use first author's last name
    first_author_last = authors[0]['last'].lower()
    
    # Remove special characters and replace spaces with hyphens
    slug = re.sub(r'[^a-z0-9\s-]', '', first_author_last)
    slug = re.sub(r'\s+', '-', slug)
    
    # Add "etal" if multiple authors
    if len(authors) > 1:
        slug += "-etal"
    
    return slug

def parse_acl_xml(xml_content: str, year: int = 2025) -> List[Dict[str, Any]]:
    """Parse ACL XML content and extract paper information."""
    root = ET.fromstring(xml_content)
    papers = []
    
    # Find all paper elements
    for paper_elem in root.findall('.//paper'):
        paper_id = paper_elem.get('id', '')
        
        # Extract title
        title_elem = paper_elem.find('title')
        title = clean_text(title_elem.text) if title_elem is not None else ''
        
        # Extract authors
        authors = extract_authors(paper_elem)
        
        # Extract abstract
        abstract_elem = paper_elem.find('abstract')
        abstract = clean_text(abstract_elem.text) if abstract_elem is not None else ''
        
        # Extract pages
        pages_elem = paper_elem.find('pages')
        pages = clean_text(pages_elem.text) if pages_elem is not None else ''
        
        # Extract URL
        url_elem = paper_elem.find('url')
        url = clean_text(url_elem.text) if url_elem is not None else ''
        
        # Extract bibkey
        bibkey_elem = paper_elem.find('bibkey')
        bibkey = clean_text(bibkey_elem.text) if bibkey_elem is not None else ''
        
        # Extract DOI if available
        doi_elem = paper_elem.find('doi')
        doi = clean_text(doi_elem.text) if doi_elem is not None else ''
        
        # Generate paper number/slug
        author_slug = generate_author_slug(authors)
        paper_number = f"{author_slug}-{year}-{title.lower().replace(' ', '-')[:50]}"
        paper_number = re.sub(r'[^a-z0-9-]', '', paper_number)
        
        paper = {
            'paper_number': paper_number,
            'xml_id': paper_id,
            'title': title,
            'abstract': abstract,
            'authors': authors,
            'author_names': [author['full_name'] for author in authors],
            'pages': pages,
            'url': url,
            'bibkey': bibkey,
            'doi': doi,
            'year': year
        }
        
        papers.append(paper)
    
    return papers

def save_papers_json(papers: List[Dict[str, Any]], filename: str = 'papers.json'):
    """Save papers to JSON file."""
    print(f"Saving {len(papers)} papers to {filename}...")
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(papers, f, indent=2, ensure_ascii=False)
    
    print(f"Successfully saved {len(papers)} papers")

def generate_authors_json(papers: List[Dict[str, Any]], filename: str = 'authors.json'):
    """Generate authors.json from papers data."""
    authors_dict = {}
    
    for paper in papers:
        for author in paper['authors']:
            full_name = author['full_name']
            if full_name not in authors_dict:
                # Generate author slug
                author_slug = author['last'].lower()
                author_slug = re.sub(r'[^a-z0-9\s-]', '', author_slug)
                author_slug = re.sub(r'\s+', '-', author_slug)
                
                authors_dict[full_name] = {
                    'name': full_name,
                    'slug': author_slug,
                    'papers': [],
                    'affiliation': author.get('affiliation', '')
                }
            
            # Add paper to author's list
            authors_dict[full_name]['papers'].append({
                'paper_number': paper['paper_number'],
                'title': paper['title']
            })
    
    # Convert to list
    authors_list = list(authors_dict.values())
    
    print(f"Saving {len(authors_list)} authors to {filename}...")
    
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(authors_list, f, indent=2, ensure_ascii=False)
    
    print(f"Successfully saved {len(authors_list)} authors")

def main():
    """Main function to process ACL XML data."""
    try:
        # Download XML data
        xml_content = download_acl_xml(2025)
        
        # Parse XML
        papers = parse_acl_xml(xml_content, 2025)
        
        # Save papers JSON
        save_papers_json(papers)
        
        # Generate authors JSON
        generate_authors_json(papers)
        
        # Print statistics
        print(f"\nProcessed {len(papers)} papers from ACL 2025")
        
        # Count papers with abstracts
        papers_with_abstracts = sum(1 for paper in papers if paper['abstract'])
        print(f"Papers with abstracts: {papers_with_abstracts}/{len(papers)}")
        
        # Count unique authors
        unique_authors = set()
        for paper in papers:
            for author in paper['authors']:
                unique_authors.add(author['full_name'])
        print(f"Unique authors: {len(unique_authors)}")
        
    except Exception as e:
        print(f"Error processing ACL XML: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())