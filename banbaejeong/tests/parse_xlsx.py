"""Independent XLSX validation using Python's ZIP/XML readers; openpyxl when installed."""
import io
import json
import sys
import zipfile
from xml.etree import ElementTree as ET
from pathlib import PurePosixPath

raw = open(sys.argv[1], 'rb').read()
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
rns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
with zipfile.ZipFile(io.BytesIO(raw)) as z:
    assert z.testzip() is None, 'CRC failure'
    assert len(z.namelist()) == len(set(z.namelist()))
    assert all(f.compress_type == zipfile.ZIP_STORED for f in z.infolist()), 'Must be uncompressed'
    for name in z.namelist():
        ET.fromstring(z.read(name))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    sheets = []
    for sheet in wb.findall('s:sheets/s:sheet', ns):
        target = rels[sheet.attrib['{' + rns + '}id']]
        name = str(PurePosixPath('xl') / target)
        tree = ET.fromstring(z.read(name))
        rows = []
        for row in tree.findall('s:sheetData/s:row', ns):
            values = []
            for cell in row.findall('s:c', ns):
                assert cell.find('s:f', ns) is None, 'No executable formulas'
                if cell.attrib.get('t') == 'inlineStr':
                    values.append(''.join(cell.itertext()))
                else:
                    v = cell.findtext('s:v', namespaces=ns)
                    v = float(v)
                    values.append(int(v) if v.is_integer() else v)
            rows.append(values)
        sheets.append({'name': sheet.attrib['name'], 'rows': rows})
try:
    import openpyxl
except ImportError:
    pass
else:
    book = openpyxl.load_workbook(io.BytesIO(raw))
    assert book.sheetnames == [s['name'] for s in sheets]
    for sheet in sheets:
        parsed = [[v if v is not None else '' for v in row] for row in book[sheet['name']].values]
        assert parsed == sheet['rows'], 'openpyxl and raw XML disagree'
        assert book[sheet['name']].freeze_panes == 'A2'
        assert all(cell.data_type != 'f' for row in book[sheet['name']] for cell in row)
print(json.dumps(sheets, ensure_ascii=False))
