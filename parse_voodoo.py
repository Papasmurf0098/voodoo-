#!/usr/bin/env python3
"""Parse all 4 voodoo source .txt files into a single drinks.json matching the app schema."""

import json
import re
import unicodedata

def slugify(text):
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    text = re.sub(r'[^\w\s-]', '', text.lower())
    text = re.sub(r'[-\s]+', '-', text).strip('-')
    return text

def parse_abv(raw):
    if not raw or 'not clearly confirmed' in raw.lower() or 'varies' in raw.lower() or 'ambiguous' in raw.lower():
        return None, None, None, None, 'not-clearly-confirmed', raw
    
    abv_match = re.search(r'(\d+\.?\d*)%\s*ABV', raw)
    proof_match = re.search(r'(\d+\.?\d*)\s*proof', raw)
    abv_val = float(abv_match.group(1)) if abv_match else None
    proof_val = float(proof_match.group(1)) if proof_match else None
    
    if raw.strip() == '0%':
        return 0.0, '0% ABV', None, None, 'exact', None

    if abv_val is not None and proof_val is None:
        proof_val = round(abv_val * 2, 1)
    
    abv_display = f"{abv_val}% ABV" if abv_val is not None else None
    proof_display = f"{proof_val} proof" if proof_val is not None else None
    
    confirmation = 'exact'
    note = None
    raw_lower = raw.lower()
    if 'batch' in raw_lower:
        confirmation = 'batch-dependent'
        note = raw
    elif 'commonly' in raw_lower or 'typically' in raw_lower or 'usually' in raw_lower:
        confirmation = 'approximate'
        note = raw
    elif 'market' in raw_lower:
        confirmation = 'market-dependent'
        note = raw
    elif 'can vary' in raw_lower or 'varies' in raw_lower:
        confirmation = 'release-dependent'
        note = raw
    
    return abv_val, abv_display, proof_val, proof_display, confirmation, note

def parse_list_items(text):
    if not text:
        return []
    text = text.strip()
    items = re.split(r',\s*(?![^(]*\))', text)
    result = []
    for item in items:
        item = item.strip().rstrip('.')
        if item:
            result.append(item)
    return result

def parse_aroma_flavor(text):
    if not text or 'not clearly confirmed' in text.lower():
        return []
    parts = re.split(r',\s*', text)
    result = []
    for p in parts:
        p = p.strip().rstrip('.')
        if p and len(p) < 120:
            p = re.sub(r'^and\s+', '', p).strip()
            if p:
                result.append(p)
    return result

def determine_family(category, subtype='', name=''):
    cat_lower = category.lower() if category else ''
    sub_lower = subtype.lower() if subtype else ''
    name_lower = name.lower() if name else ''
    
    if 'ready-to-drink' in cat_lower or 'hard seltzer' in cat_lower or 'rtd' in cat_lower or 'canned cocktail' in cat_lower:
        return 'RTD'
    if 'mocktail' in cat_lower or 'mocktail' in sub_lower or 'non-alcoholic cocktail' in cat_lower:
        return 'Mocktail'
    if 'cocktail' in cat_lower or 'cocktail' in sub_lower:
        return 'Cocktail'
    if 'bourbon' in cat_lower or 'whiskey' in cat_lower or 'whisky' in cat_lower or 'rye' in cat_lower or 'scotch' in cat_lower:
        return 'Whiskey'
    if cat_lower in ('whiskey flight',):
        return 'Whiskey'
    if 'american whiskey' in cat_lower or 'american single malt' in cat_lower:
        return 'Whiskey'
    if 'single malt' in cat_lower or 'tennessee' in cat_lower:
        return 'Whiskey'
    if 'wine' in cat_lower or 'champagne' in cat_lower or 'sparkling' in cat_lower:
        return 'Wine'
    if 'vodka' in cat_lower or 'gin' in cat_lower or 'rum' in cat_lower or 'tequila' in cat_lower or 'mezcal' in cat_lower:
        return 'Spirit'
    if 'brandy' in cat_lower or 'cognac' in cat_lower or 'liqueur' in cat_lower or 'amaro' in cat_lower:
        return 'Spirit'
    if 'absinthe' in cat_lower or 'aperitif' in cat_lower or 'vermouth' in cat_lower:
        return 'Spirit'
    if 'beer' in cat_lower or 'ipa' in cat_lower or 'lager' in cat_lower or 'ale' in cat_lower or 'stout' in cat_lower:
        return 'Beer'
    if 'pilsner' in cat_lower or 'wheat beer' in cat_lower or 'belgian' in cat_lower:
        return 'Beer'
    if 'seltzer' in cat_lower:
        return 'RTD'
    if 'water' in cat_lower:
        return 'Water'
    if 'soft drink' in cat_lower or 'cola' in cat_lower or 'root beer' in cat_lower or 'soda' in cat_lower:
        return 'Soft Drink'
    if 'energy drink' in cat_lower:
        return 'Soft Drink'
    if 'tea' in cat_lower or 'non-alcoholic' in cat_lower or 'juice' in cat_lower:
        return 'Soft Drink'
    
    return 'Spirit'


def refine_wine_category(entry):
    """Refine generic 'Wine' categories into Red wine, White wine, Rose wine based on subtype/varietal."""
    if entry.get('category', '').lower() != 'wine':
        return entry['category']
    
    sub = (entry.get('subtype') or '').lower()
    name = (entry.get('name') or '').lower()
    
    rose_markers = ['rose', 'rosé', 'rosato']
    if any(m in sub for m in rose_markers) or any(m in name for m in rose_markers):
        return 'Rose wine'
    
    red_grapes = ['cabernet', 'merlot', 'pinot noir', 'malbec', 'syrah', 'shiraz', 'tempranillo', 
                  'zinfandel', 'sangiovese', 'nebbiolo', 'red blend', 'red wine', 'chianti',
                  'bordeaux red', 'rioja', 'barolo', 'brunello']
    if any(g in sub for g in red_grapes) or any(g in name for g in red_grapes):
        return 'Red wine'
    
    white_grapes = ['chardonnay', 'sauvignon blanc', 'riesling', 'pinot grigio', 'pinot gris',
                    'moscato', 'chenin blanc', 'viognier', 'white blend', 'white wine', 'gruner',
                    'albarino', 'vermentino', 'gewurztraminer', 'semillon', 'trebbiano']
    if any(g in sub for g in white_grapes) or any(g in name for g in white_grapes):
        return 'White wine'
    
    return 'Wine'

def parse_origin(raw):
    if not raw or 'not clearly confirmed' in raw.lower():
        return {"country": None, "region": None, "display": raw or "Unknown"}
    
    raw_clean = re.sub(r'\(.*?\)', '', raw).strip()
    
    parts = [p.strip() for p in raw_clean.split(',')]
    if len(parts) >= 2:
        country = parts[-1].strip()
        region = ', '.join(parts[:-1]).strip()
        return {"country": country, "region": region, "display": raw_clean}
    elif len(parts) == 1:
        return {"country": parts[0], "region": None, "display": raw_clean}
    
    return {"country": None, "region": None, "display": raw}

def determine_confidence(text):
    if not text:
        return "Medium"
    text_lower = text.lower().strip()
    if 'high' in text_lower:
        return "High"
    if 'low' in text_lower:
        return "Low"
    return "Medium"

def determine_profile_level(text):
    if not text:
        return "Product-specific"
    text_lower = text.lower()
    if 'category' in text_lower:
        return "Category-level"
    if 'family' in text_lower:
        return "Product-family level"
    if 'venue' in text_lower:
        return "Venue-service level"
    return "Product-specific"

def determine_ambiguity(text):
    if not text:
        return "Clear"
    text_lower = text.lower()
    if 'unambiguous' in text_lower or 'not ambiguous' in text_lower or 'clear entry' in text_lower or 'clear' == text_lower.strip().rstrip('.'):
        return "Clear"
    return text.strip().rstrip('.')

def generate_tags(entry):
    tags = []
    sub = (entry.get('subtype') or '').lower()
    cat = (entry.get('category') or '').lower()
    ambiguity = (entry.get('_ambiguity') or '').lower()
    confidence = (entry.get('_confidence') or '').lower()
    
    if 'wheated' in sub:
        tags.append('wheated')
    if 'barrel proof' in sub or 'cask strength' in sub or 'barrel-proof' in sub:
        tags.append('barrel_proof')
    if 'single barrel' in sub:
        tags.append('single_barrel')
    if 'small batch' in sub:
        tags.append('small_batch')
    if 'bottled-in-bond' in sub or 'bottled in bond' in sub:
        tags.append('bottled_in_bond')
    if 'finished' in sub or 'cask' in sub:
        tags.append('finished')
    if 'port' in sub:
        tags.append('port_cask')
    if 'flight' in cat:
        tags.append('flight')
    if 'private' in sub or 'private barrel' in sub:
        tags.append('private_barrel')
    if 'ambiguous' in ambiguity or 'likely' in ambiguity:
        tags.append('likely_interpretation')
    if 'batch' in ambiguity:
        tags.append('batch_variation')
    if 'market' in ambiguity:
        tags.append('market_variation')
    
    return tags

def generate_whiskey_data(entry):
    family = entry.get('family', '')
    if family != 'Whiskey':
        return None
    
    cat = entry.get('category', '')
    sub = entry.get('subtype', '')
    tags = entry.get('tags', [])
    
    display_tags = []
    style_terms = []
    
    sub_lower = sub.lower() if sub else ''
    cat_lower = cat.lower() if cat else ''
    
    style_terms.append(cat_lower)
    if sub:
        style_terms.append(sub_lower)
    
    if 'wheated' in sub_lower:
        display_tags.append('Wheated')
    if 'barrel proof' in sub_lower or 'cask strength' in sub_lower:
        display_tags.append('Barrel Proof')
    if 'single barrel' in sub_lower:
        display_tags.append('Single Barrel')
    if 'small batch' in sub_lower:
        display_tags.append('Small Batch')
    if 'bottled-in-bond' in sub_lower or 'bottled in bond' in sub_lower:
        display_tags.append('Bottled-in-Bond')
    if 'finished' in sub_lower:
        display_tags.append('Finished')
    if 'port' in sub_lower:
        display_tags.append('Port Cask')
    if 'rye' in sub_lower and 'bourbon' not in sub_lower:
        display_tags.append('Rye')
    if 'high-rye' in sub_lower:
        display_tags.append('High-Rye')
    if 'scotch' in cat_lower:
        display_tags.append('Scotch')
    if 'japanese' in cat_lower or 'japanese' in sub_lower:
        display_tags.append('Japanese')
    if 'irish' in cat_lower or 'irish' in sub_lower:
        display_tags.append('Irish')
    if 'flight' in cat_lower:
        display_tags.append('Flight')
    if 'private' in sub_lower:
        display_tags.append('Private Barrel')
    
    for t in tags:
        term = t.replace('_', ' ')
        cap = term.title()
        if cap not in display_tags:
            display_tags.append(cap)
    
    return {
        "displayTags": display_tags,
        "styleTerms": list(set(style_terms))
    }

def parse_entries_from_text(text, source_file):
    entries = []
    
    lines = text.split('\n')
    
    current_entry = {}
    current_field = None
    in_research = False
    in_pairings = False
    heading_name = None
    
    def flush_entry():
        nonlocal current_entry, heading_name
        if current_entry.get('name'):
            if heading_name and not current_entry.get('_heading'):
                current_entry['_heading'] = heading_name
            entries.append(current_entry)
        current_entry = {}
        heading_name = None
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        
        if not line:
            continue
        
        if line.startswith('## '):
            flush_entry()
            heading_name = line[3:].strip()
            continue
        
        if line.startswith('Name:'):
            if current_entry.get('name'):
                flush_entry()
            val = line[5:].strip()
            current_entry['name'] = val
            if heading_name:
                current_entry['_heading'] = heading_name
            in_research = False
            in_pairings = False
            current_field = 'name'
            continue
        
        if line.startswith('Category:'):
            current_entry['category'] = line[9:].strip()
            current_field = 'category'
            in_research = False
            in_pairings = False
            continue
        
        if line.startswith('Subtype / Varietal:') or line.startswith('Subtype/Varietal:'):
            val = re.sub(r'^Subtype\s*/\s*Varietal:\s*', '', line).strip()
            current_entry['subtype'] = val
            current_field = 'subtype'
            continue
        
        if line.startswith('Producer:'):
            current_entry['producer'] = line[9:].strip()
            current_field = 'producer'
            continue
        
        if line.startswith('Region / Origin:') or line.startswith('Region/Origin:'):
            val = re.sub(r'^Region\s*/\s*Origin:\s*', '', line).strip()
            current_entry['_origin_raw'] = val
            current_field = 'origin'
            continue
        
        if line.startswith('ABV / Strength:') or line.startswith('ABV/Strength:'):
            val = re.sub(r'^ABV\s*/\s*Strength:\s*', '', line).strip()
            current_entry['_abv_raw'] = val
            current_field = 'abv'
            continue
        
        if line.startswith('Aroma Notes:') or line.startswith('Aroma:'):
            val = re.sub(r'^Aroma\s*(Notes)?:\s*', '', line).strip()
            current_entry['_aroma_raw'] = val
            current_field = 'aroma'
            continue
        
        if line.startswith('Flavor Profile:') or line.startswith('Flavor:'):
            val = re.sub(r'^Flavor\s*(Profile)?:\s*', '', line).strip()
            current_entry['_flavor_raw'] = val
            current_field = 'flavor'
            continue
        
        if line.startswith('Body / Texture:') or line.startswith('Body/Texture:'):
            val = re.sub(r'^Body\s*/\s*Texture:\s*', '', line).strip()
            current_entry['body'] = val
            current_field = 'body'
            continue
        
        if line.startswith('Finish:'):
            current_entry['finish'] = line[7:].strip()
            current_field = 'finish'
            continue
        
        if line.startswith('Pairings:'):
            in_pairings = True
            current_field = 'pairings'
            continue
        
        if line.startswith('Notable Signature Traits:') or line.startswith('Signature Traits:'):
            val = re.sub(r'^(Notable\s+)?Signature\s+Traits:\s*', '', line).strip()
            current_entry['signatureTraits'] = val
            current_field = 'signature'
            in_pairings = False
            continue
        
        if line.startswith('Research Notes:'):
            in_research = True
            in_pairings = False
            current_field = 'research'
            continue
        
        if in_pairings:
            clean = re.sub(r'^[•\-]\s*', '', line).strip()
            if clean.lower().startswith('proteins:'):
                current_entry['_proteins'] = clean[9:].strip()
            elif clean.lower().startswith('spices / flavor companions:') or clean.lower().startswith('spices/flavor companions:'):
                val = re.sub(r'^Spices\s*/?\s*Flavor\s+Companions:\s*', '', clean, flags=re.IGNORECASE).strip()
                current_entry['_spices'] = val
            elif clean.lower().startswith('cheeses:'):
                current_entry['_cheeses'] = clean[8:].strip()
            elif clean.lower().startswith('cuisines:'):
                current_entry['_cuisines'] = clean[9:].strip()
            continue
        
        if in_research:
            clean = re.sub(r'^[•\-]\s*', '', line).strip()
            if clean.lower().startswith('source types consulted:'):
                current_entry['_sources'] = clean[22:].strip()
            elif clean.lower().startswith('conflicts found:'):
                current_entry['_conflicts'] = clean[16:].strip()
            elif clean.lower().startswith('resolution:'):
                current_entry['_resolution'] = clean[11:].strip()
            elif clean.lower().startswith('confidence level:') or clean.lower().startswith('confidence:'):
                val = re.sub(r'^Confidence\s*(level)?:\s*', '', clean, flags=re.IGNORECASE).strip()
                current_entry['_confidence'] = val
            elif clean.lower().startswith('product-specific or category-level:'):
                current_entry['_profile_level'] = clean[34:].strip()
            elif clean.lower().startswith('ambiguity status:'):
                current_entry['_ambiguity'] = clean[17:].strip()
            continue
    
    flush_entry()
    return entries

def convert_to_schema(raw_entry, source_file):
    name = raw_entry.get('name', 'Unknown')
    heading = raw_entry.get('_heading', name)
    category = raw_entry.get('category', '')
    subtype = raw_entry.get('subtype', '')
    
    entry_id = slugify(heading if heading else name)
    if not entry_id:
        entry_id = slugify(name)
    
    family = determine_family(category, subtype, name)
    
    refined_category = refine_wine_category({'category': category, 'subtype': subtype, 'name': name})
    if refined_category != category:
        category = refined_category
    
    origin = parse_origin(raw_entry.get('_origin_raw', ''))
    
    abv_val, abv_display, proof_val, proof_display, confirmation, note = parse_abv(raw_entry.get('_abv_raw', ''))
    
    strength = {}
    if abv_val is not None:
        strength['abv'] = abv_val
        strength['abvDisplay'] = abv_display
    if proof_val is not None:
        strength['proof'] = proof_val
        strength['proofDisplay'] = proof_display
    if confirmation:
        strength['confirmation'] = confirmation
    if note:
        strength['note'] = note
    if not strength.get('abvDisplay') and not strength.get('proofDisplay'):
        strength['display'] = raw_entry.get('_abv_raw', 'Not clearly confirmed')
        strength['confirmation'] = 'not-clearly-confirmed'
    
    aroma = parse_aroma_flavor(raw_entry.get('_aroma_raw', ''))
    flavor = parse_aroma_flavor(raw_entry.get('_flavor_raw', ''))
    
    tasting = {
        "aroma": aroma,
        "flavor": flavor,
    }
    if raw_entry.get('body'):
        tasting['body'] = raw_entry['body']
    if raw_entry.get('finish'):
        tasting['finish'] = raw_entry['finish']
    
    pairings = {
        "proteins": parse_list_items(raw_entry.get('_proteins', '')),
        "spices_flavor_companions": parse_list_items(raw_entry.get('_spices', '')),
        "cheeses": parse_list_items(raw_entry.get('_cheeses', '')),
        "cuisines": parse_list_items(raw_entry.get('_cuisines', '')),
    }
    
    sig_raw = raw_entry.get('signatureTraits', '')
    sig_traits = [sig_raw] if sig_raw else []
    
    tags = generate_tags({
        'subtype': subtype,
        'category': category,
        '_ambiguity': raw_entry.get('_ambiguity', ''),
        '_confidence': raw_entry.get('_confidence', ''),
        'family': family,
    })
    
    sources_raw = raw_entry.get('_sources', '')
    sources = [s.strip().rstrip('.') for s in re.split(r'[;]', sources_raw) if s.strip()] if sources_raw else []
    
    confidence = determine_confidence(raw_entry.get('_confidence', ''))
    profile_level = determine_profile_level(raw_entry.get('_profile_level', ''))
    ambiguity_status = determine_ambiguity(raw_entry.get('_ambiguity', ''))
    
    caveats = []
    ambiguity_lower = (raw_entry.get('_ambiguity', '') or '').lower()
    if 'batch' in ambiguity_lower:
        caveats.append('batch_variation')
    if 'barrel' in ambiguity_lower:
        caveats.append('barrel_variation')
    if 'market' in ambiguity_lower:
        caveats.append('market_variation')
    if 'private' in ambiguity_lower:
        caveats.append('private_barrel')
    if 'likely' in ambiguity_lower:
        caveats.append('likely_interpretation')
    if 'release' in ambiguity_lower or 'seasonal' in ambiguity_lower:
        caveats.append('release_variation')
    
    research = {
        "sourceTypesConsulted": sources,
        "conflictsFound": raw_entry.get('_conflicts', ''),
        "resolution": raw_entry.get('_resolution', ''),
        "confidence": confidence,
        "profileLevel": profile_level,
        "ambiguityStatus": ambiguity_status,
        "caveats": caveats,
    }
    
    source_record = {"displayName": heading if heading else name}
    if heading and heading != name:
        source_record["normalizedFrom"] = heading
    
    entry = {
        "id": entry_id,
        "name": name,
        "family": family,
        "category": category,
        "subtype": subtype if subtype else None,
        "producer": raw_entry.get('producer', None),
        "origin": origin,
        "strength": strength,
        "tasting": tasting,
        "pairings": pairings,
        "signatureTraits": sig_traits,
        "tags": tags,
        "research": research,
        "sourceRecord": source_record,
    }
    
    whiskey_data = generate_whiskey_data(entry)
    if whiskey_data:
        entry['whiskey'] = whiskey_data
    
    return entry

def main():
    source_files = [
        'voodoo_whiskey_bourbon_profiles_master.txt',
        'voodoo_spirits_research_profiles.txt',
        'voodoo_wines_profiles.txt',
        'voodoo_drink_research_profiles.txt',
    ]
    
    all_entries = []
    seen_ids = set()
    
    for fname in source_files:
        with open(fname, 'r') as f:
            text = f.read()
        
        raw_entries = parse_entries_from_text(text, fname)
        print(f"{fname}: parsed {len(raw_entries)} raw entries")
        
        for raw in raw_entries:
            entry = convert_to_schema(raw, fname)
            
            base_id = entry['id']
            if base_id in seen_ids:
                counter = 2
                while f"{base_id}-{counter}" in seen_ids:
                    counter += 1
                entry['id'] = f"{base_id}-{counter}"
            
            seen_ids.add(entry['id'])
            all_entries.append(entry)
    
    output = {"entries": all_entries}
    
    with open('data/drinks.json', 'w') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    print(f"\nTotal entries written: {len(all_entries)}")
    
    families = {}
    for e in all_entries:
        fam = e['family']
        families[fam] = families.get(fam, 0) + 1
    print("\nFamily breakdown:")
    for fam, count in sorted(families.items(), key=lambda x: -x[1]):
        print(f"  {fam}: {count}")

if __name__ == '__main__':
    main()
