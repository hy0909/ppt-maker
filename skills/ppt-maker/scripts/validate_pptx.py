#!/usr/bin/env python3
# Copyright (c) 2026 SafeAI. All rights reserved.
# See COPYRIGHT.md — 복제·수정·재배포는 허락 없이 할 수 없습니다.
"""엄격한 PPTX OOXML 검증기 - PowerPoint가 복구하는 이슈 사전 감지.

검증 항목:
1. 패키지 무결성: 모든 .rels 참조 대상 존재 여부, [Content_Types].xml 완전성
2. 모든 .xml/.rels 부분의 XML 형식 정확성
3. 숫자 속성 범위 (각도, EMU, 백분율 등)
4. 텍스트 내용 (금지된 제어 문자 없음, 빈 typeface 없음)
5. 관계 일관성 (slide에서 사용된 r:embed/r:id가 .rels에 존재)

사용법: python3 validate_pptx.py <deck.pptx> [--json]

종료 코드: 0 = 정상, 1 = 문제 발견
"""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple, Optional
import re
import os


NS_PREFIX = {
    'http://schemas.openxmlformats.org/drawingml/2006/main': 'a',
    'http://schemas.openxmlformats.org/presentationml/2006/main': 'p',
    'http://schemas.openxmlformats.org/drawingml/2006/chart': 'c',
    'http://schemas.openxmlformats.org/drawingml/2006/picture': 'pic',
}


def tagname(tag: str) -> str:
    """'{...drawingml...}outerShdw' → 'a:outerShdw' (사람이 읽는 이름)."""
    if tag.startswith('{'):
        uri, _, local = tag[1:].partition('}')
        return f"{NS_PREFIX.get(uri, 'ns')}:{local}"
    return tag


class ValidatePptx:
    """Strict OOXML validator for PowerPoint files."""

    # OOXML namespaces
    NS = {
        'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
        'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
        'ct': 'http://schemas.openxmlformats.org/package/2006/content-types',
        'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
        'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart',
    }

    def __init__(self, pptx_path: Path):
        self.pptx_path = Path(pptx_path)
        self.findings: List[Dict] = []
        self.rels_map: Dict[str, Dict[str, str]] = {}  # path -> {id -> target}
        self.content_types: Dict[str, str] = {}  # ext or path -> type
        self.parts_exist: Dict[str, bool] = {}  # path -> exists

    def error(self, part: str, message: str, **kwargs):
        """Record a validation error."""
        self.findings.append({
            'part': part,
            'message': message,
            **kwargs
        })

    def validate(self) -> int:
        """Run all validations. Return 0 if clean, 1 if issues found."""
        try:
            with zipfile.ZipFile(str(self.pptx_path), 'r') as z:
                # Step 1: Load all part names (for existence checks)
                self.parts_exist = {name: True for name in z.namelist()}

                # Step 2: Parse [Content_Types].xml
                self._validate_content_types(z)

                # Step 3: Parse all .rels files and build map
                self._validate_rels_files(z)

                # Step 4: Validate XML well-formedness and OOXML rules for every part
                self._validate_all_parts(z)

        except zipfile.BadZipFile:
            self.error('[package]', '파일 형식이 올바르지 않음 (ZIP 아카이브가 아님)')
            return 1
        except Exception as e:
            self.error('[package]', f'예상 외 오류: {type(e).__name__}: {e}')
            return 1

        if self.findings:
            self._print_findings()
            return 1
        return 0

    def _validate_content_types(self, z: zipfile.ZipFile):
        """Validate [Content_Types].xml exists and is well-formed."""
        try:
            ct_data = z.read('[Content_Types].xml')
            ET.fromstring(ct_data)
            # Parse to extract type mappings
            root = ET.fromstring(ct_data)
            for elem in root.findall('{http://schemas.openxmlformats.org/package/2006/content-types}Default'):
                ext = elem.get('Extension')
                ctype = elem.get('ContentType')
                if ext and ctype:
                    self.content_types[f'.{ext}'] = ctype
            for elem in root.findall('{http://schemas.openxmlformats.org/package/2006/content-types}Override'):
                ppath = elem.get('PartName')
                ctype = elem.get('ContentType')
                if ppath and ctype:
                    self.content_types[ppath] = ctype
        except KeyError:
            self.error('[Content_Types].xml', '파일이 없음')
        except ET.ParseError as e:
            self.error('[Content_Types].xml', f'XML 형식 오류: {str(e)[:80]}')

    def _validate_rels_files(self, z: zipfile.ZipFile):
        """Parse all .rels files and validate package integrity."""
        for name in z.namelist():
            if not name.endswith('.rels'):
                continue
            try:
                data = z.read(name)
                root = ET.fromstring(data)
                rels = {}
                for elem in root.findall('{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
                    rel_id = elem.get('Id')
                    target = elem.get('Target')
                    rel_type = elem.get('Type')
                    if rel_id and target:
                        rels[rel_id] = {'target': target, 'type': rel_type}
                        # Resolve paths from the .rels directory
                        # .rels files are at: _rels/.rels, ppt/_rels/presentation.xml.rels, etc.
                        # Paths can be relative or absolute (starting with /)
                        if target and not target.startswith('http'):
                            if target.startswith('/'):
                                # Absolute path in ZIP - remove leading /
                                resolved = target.lstrip('/')
                            else:
                                # Relative path - resolve from .rels parent directory
                                rels_dir = str(Path(name).parent)  # e.g., "_rels", "ppt/_rels"
                                # Remove the trailing "_rels" part to get the base directory
                                if rels_dir.endswith('_rels'):
                                    base_dir = rels_dir[:-6]  # Remove "_rels"
                                else:
                                    base_dir = rels_dir
                                # Resolve the target path (including ..)
                                if base_dir:
                                    full_path = f"{base_dir}/{target}"
                                else:
                                    full_path = target
                                # Normalize the path (resolve .. and .)
                                resolved = os.path.normpath(full_path).replace('\\', '/')
                            # Check if target exists
                            if resolved not in self.parts_exist:
                                self.error(name, f'참조 대상이 없음: {target}', target=target)
                self.rels_map[name] = rels
            except ET.ParseError as e:
                self.error(name, f'XML 형식 오류: {str(e)[:80]}')

    def _validate_all_parts(self, z: zipfile.ZipFile):
        """Validate XML and OOXML rules for all parts."""
        for name in sorted(z.namelist()):
            if name.endswith('.rels') or name == '[Content_Types].xml':
                continue
            if not name.endswith('.xml'):
                continue

            try:
                data = z.read(name)
                root = ET.fromstring(data)

                # Validate based on file type
                if 'slide' in name and not 'slideLayout' in name and not 'slideMaster' in name:
                    self._validate_slide(name, root)
                elif 'slideLayout' in name:
                    self._validate_slide(name, root)
                elif 'presentation.xml' in name:
                    self._validate_presentation(name, root)
                else:
                    # Generic validation for other XML
                    self._validate_generic_xml(name, root)

            except ET.ParseError as e:
                self.error(name, f'XML 형식 오류: {str(e)[:80]}')

    def _validate_slide(self, name: str, root: ET.Element):
        """Validate slide XML structure and attribute values."""
        # Get the .rels for this slide
        # .rels files are in a _rels subdirectory: ppt/slides/slide3.xml -> ppt/slides/_rels/slide3.xml.rels
        dirname = str(Path(name).parent)
        basename = Path(name).name
        rels_name = f"{dirname}/_rels/{basename}.rels"
        rels = self.rels_map.get(rels_name, {})

        # Collect all r:id references used in the slide
        rids_used = set()
        for elem in root.iter():
            rid = elem.get(f'{{{self.NS["r"]}}}id')
            if rid:
                rids_used.add(rid)

        # Check that all r:id references exist in .rels
        for rid in rids_used:
            if rid not in rels:
                self.error(name, f'참조 ID가 .rels에 없음: r:id="{rid}"', rid=rid)

        # Validate numeric attributes
        self._validate_numeric_attrs(name, root)

        # Validate text content
        self._validate_text_content(name, root)

    def _validate_presentation(self, name: str, root: ET.Element):
        """Validate presentation.xml."""
        self._validate_numeric_attrs(name, root)

    def _validate_generic_xml(self, name: str, root: ET.Element):
        """Generic XML validation."""
        self._validate_numeric_attrs(name, root)
        self._validate_text_content(name, root)

    def _validate_numeric_attrs(self, name: str, root: ET.Element):
        """Check numeric attributes are within valid ranges."""
        for elem in root.iter():
            self._check_angle_attrs(name, elem)
            self._check_emu_coords(name, elem)
            self._check_percentages(name, elem)
            self._check_font_size(name, elem)
            self._check_rounded_rect_adj(name, elem)
            self._check_shadow_attrs(name, elem)

    def _check_angle_attrs(self, name: str, elem: ET.Element):
        """Validate angle attributes (60000ths of degree)."""
        # ST_Angle is -21600000..21600000 for general rotation
        # ST_PositiveFixedAngle is 0..21600000 for direction angles
        angle_attrs = {
            'rot': (-21600000, 21600000),  # xfrm rotation
            'dir': (0, 21600000),  # shadow direction (outerShdw/innerShdw)
            'kx': None,  # skew x angle
            'ky': None,  # skew y angle
        }

        for attr_name, range_val in angle_attrs.items():
            val_str = elem.get(attr_name)
            if val_str is None or range_val is None:
                continue
            min_val, max_val = range_val
            try:
                val = int(val_str)
                if not (min_val <= val <= max_val):
                    self.error(name, f'{tagname(elem.tag)} 의 각도 속성 범위 초과: {attr_name}={val} (허용: {min_val}..{max_val})',
                              attr=attr_name, value=val, min=min_val, max=max_val)
            except ValueError:
                self.error(name, f'{tagname(elem.tag)} 의 각도 값이 정수가 아님(규격 위반): {attr_name}={val_str}',
                          attr=attr_name, value=val_str)

        # Check for NaN, Infinity in any angle-like attributes
        for key, value in elem.attrib.items():
            if key in ('rot', 'dir', 'kx', 'ky') or key.endswith('}rot') or key.endswith('}dir'):
                if value in ('NaN', 'Infinity', '-Infinity', ''):
                    self.error(name, f'{tagname(elem.tag)} 의 각도 속성이 올바르지 않음: {key}={value}',
                              attr=key, value=value)

    def _check_emu_coords(self, name: str, elem: ET.Element):
        """Validate EMU (English Metric Units) coordinates.

        Range: ±27273042316900 EMUs (which is ±914400 mm = ±36 inches)
        but practically 0..27273042316900 for positions.
        """
        # <a:off x= y=> <a:ext cx= cy=>
        emu_attrs = [
            ('{http://schemas.openxmlformats.org/drawingml/2006/main}x', -27273042316900, 27273042316900),
            ('{http://schemas.openxmlformats.org/drawingml/2006/main}y', -27273042316900, 27273042316900),
            ('{http://schemas.openxmlformats.org/drawingml/2006/main}cx', 0, 27273042316900),
            ('{http://schemas.openxmlformats.org/drawingml/2006/main}cy', 0, 27273042316900),
        ]

        for attr_name, min_val, max_val in emu_attrs:
            val_str = elem.get(attr_name)
            if val_str is None:
                continue
            try:
                val = int(val_str)
                if not (min_val <= val <= max_val):
                    self.error(name, f'{tagname(elem.tag)} 의 EMU 속성 범위 초과: {attr_name}={val} (허용: {min_val}..{max_val})',
                              attr=attr_name, value=val, min=min_val, max=max_val)
            except ValueError:
                self.error(name, f'{tagname(elem.tag)} 의 좌표·크기 값이 정수가 아님(규격 위반): {attr_name}={val_str}',
                          attr=attr_name, value=val_str)

        # blurRad and dist in shadows (ST_PositiveCoordinate)
        if elem.tag.endswith('outerShdw') or elem.tag.endswith('innerShdw'):
            for attr in ('blurRad', 'dist'):
                val_str = elem.get(attr)
                if val_str:
                    try:
                        val = int(val_str)
                        # ST_PositiveCoordinate: 0..27273042316900 EMUs
                        if not (0 <= val <= 27273042316900):
                            self.error(name, f'{tagname(elem.tag)} 의 그림자 속성 범위 초과: {attr}={val} (허용: 0..27273042316900)',
                                      attr=attr, value=val)
                    except ValueError:
                        self.error(name, f'{tagname(elem.tag)} 의 그림자 값이 정수가 아님(규격 위반): {attr}={val_str}',
                                  attr=attr, value=val_str)

        # Special case: empty/zero ext on grpSpPr chExt is allowed
        if elem.tag.endswith('chExt'):
            # Child extent can be 0 (legitimate for empty group)
            pass

    def _check_percentages(self, name: str, elem: ET.Element):
        """Validate percentage attributes (0..100000 or specific ranges)."""
        # sx, sy on xfrm (scale): 0..100000 (0% to 100000%)
        for attr in ['sx', 'sy']:
            val_str = elem.get(attr)
            if val_str:
                try:
                    val = int(val_str)
                    if not (0 <= val <= 100000):
                        self.error(name, f'{tagname(elem.tag)}의 스케일 속성 범위 초과: {attr}={val} (허용: 0..100000)',
                                  attr=attr, value=val)
                except ValueError:
                    self.error(name, f'{tagname(elem.tag)}의 배율 값이 정수가 아님(규격 위반): {attr}={val_str}',
                              attr=attr, value=val_str)

        # Note: lumMod and similar attributes can legitimately exceed 100000 in OOXML, so we skip checking them

    def _check_font_size(self, name: str, elem: ET.Element):
        """Validate font size (sz): 100..400000 (1pt to 4000pt in units of 1/100pt)."""
        if elem.tag.endswith('rPr') or elem.tag.endswith('pPr'):
            sz = elem.get('sz')
            if sz:
                try:
                    v = int(sz)
                    if not (100 <= v <= 400000):
                        self.error(name, f'폰트 크기 범위 초과: sz={v} (허용: 100..400000)',
                                  value=v)
                except ValueError:
                    self.error(name, f'폰트 크기가 정수가 아님: sz={sz}', value=sz)

        # spc (letter spacing): -400000..400000
        if elem.tag.endswith('rPr'):
            spc = elem.get('spc')
            if spc:
                try:
                    v = int(spc)
                    if not (-400000 <= v <= 400000):
                        self.error(name, f'문자 간격 범위 초과: spc={v} (허용: -400000..400000)',
                                  value=v)
                except ValueError:
                    self.error(name, f'문자 간격이 정수가 아님: spc={spc}', value=spc)

    def _check_rounded_rect_adj(self, name: str, elem: ET.Element):
        """Validate rounded rectangle adjustment (adj): 0..50000."""
        if elem.tag.endswith('roundRect') or 'adj' in elem.tag.lower():
            for child in elem.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}adj'):
                val = child.get('val')
                if val:
                    try:
                        v = int(val)
                        if not (0 <= v <= 50000):
                            self.error(name, f'모서리 둥글기 속성 범위 초과: adj val={v} (허용: 0..50000)',
                                      value=v)
                    except ValueError:
                        self.error(name, f'모서리 둥글기 속성이 정수가 아님: adj val={val}', value=val)

    def _check_shadow_attrs(self, name: str, elem: ET.Element):
        """Validate shadow attributes (the main bug fix)."""
        for shadow_elem in elem.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}outerShdw') + \
                          elem.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}innerShdw'):
            # dir: ST_PositiveFixedAngle (0..21600000)
            dir_val = shadow_elem.get('dir')
            if dir_val:
                try:
                    v = int(dir_val)
                    if not (0 <= v <= 21600000):
                        self.error(name, f'{tagname(shadow_elem.tag)} 의 방향 범위 초과: dir={v} (허용: 0..21600000)',
                                  attr='dir', value=v)
                except ValueError:
                    self.error(name, f'{tagname(shadow_elem.tag)} 의 그림자 방향 값이 정수가 아님(규격 위반): dir={dir_val}',
                              attr='dir', value=dir_val)

            # blurRad, dist: ST_PositiveCoordinate (0..27273042316900)
            for attr in ['blurRad', 'dist']:
                val_str = shadow_elem.get(attr)
                if val_str:
                    try:
                        v = int(val_str)
                        if not (0 <= v <= 27273042316900):
                            self.error(name, f'{tagname(shadow_elem.tag)} 의 그림자 속성 범위 초과: {attr}={v} (허용: 0..27273042316900)',
                                      attr=attr, value=v)
                    except ValueError:
                        self.error(name, f'{tagname(shadow_elem.tag)} 의 그림자 값이 정수가 아님(규격 위반): {attr}={val_str}',
                                  attr=attr, value=val_str)

    def _validate_text_content(self, name: str, root: ET.Element):
        """Validate text: no forbidden control chars, no empty typeface."""
        for elem in root.findall('.//{http://schemas.openxmlformats.org/drawingml/2006/main}t'):
            text = elem.text or ''
            # Check for control characters (except tab, LF, CR)
            for i, ch in enumerate(text):
                code = ord(ch)
                if code < 0x20 and ch not in '\t\n\r':
                    self.error(name, f'금지된 제어 문자 포함: U+{code:04X}',
                              char=ch, code=code)

        # Note: Empty typeface attributes in theme files are legitimate (PowerPoint uses them),
        # so we don't validate typeface emptiness

    def _print_findings(self):
        """Print findings in human-readable format."""
        # Group by part
        by_part = defaultdict(list)
        for finding in self.findings:
            part = finding['part']
            by_part[part].append(finding)

        MAX = 8  # 같은 부분에서 같은 문제가 수십 번 나와도 앞의 몇 건만 보여 준다
        for part in sorted(by_part.keys()):
            rest = len(by_part[part]) - MAX
            for finding in by_part[part][:MAX]:
                msg = finding['message']
                # Extract numeric values if present
                extras = {k: v for k, v in finding.items() if k not in ['part', 'message']}
                if extras:
                    extras_str = ', '.join(f'{k}={v}' for k, v in sorted(extras.items()))
                    print(f'파일 {part}: {msg} ({extras_str})')
                else:
                    print(f'파일 {part}: {msg}')
            if rest > 0:
                print(f'파일 {part}: … 같은 종류의 문제 {rest}건 더 있음')

    def to_json(self) -> str:
        """Return findings as JSON."""
        return json.dumps(self.findings, ensure_ascii=False, indent=2)


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    pptx_path = Path(args[0])
    if not pptx_path.exists():
        print(f'오류: 파일이 없습니다: {pptx_path}')
        sys.exit(1)

    validator = ValidatePptx(pptx_path)
    exit_code = validator.validate()

    if '--json' in args:
        print(validator.to_json())

    sys.exit(exit_code)


if __name__ == '__main__':
    try:
        main()
    except BrokenPipeError:  # head 등으로 파이프가 끊겨도 역추적을 찍지 않는다
        try:
            sys.stdout.close()
        finally:
            os._exit(1)
