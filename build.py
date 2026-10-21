"""Ghép mã nguồn trong src/ thành 1 file docs/index.html (chạy được cả offline lẫn trên GitHub Pages).
Chạy:  python build.py
"""
import os, re
D = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: open(os.path.join(D, p), encoding='utf-8').read()
s = rd('src/app.html')
rep = {'/*SHEETJS*/': rd('vendor/xlsx.bundle.js').replace('</script', '<\\/script'),
       '/*QRLIB*/': rd('vendor/qrcode.js').replace('</script', '<\\/script'), '/*KYTHI*/': rd('src/kythi.js'),
       '/*CORE*/': rd('src/core.js'), '/*STORE*/': rd('src/store.js'), '/*KHOA*/': rd('src/khoa.js'),
       '/*MONEY*/': rd('src/money.js'), '/*MGMT*/': rd('src/mgmt.js')}
for k, v in rep.items():
    assert s.count(k) == 1, k
    s = s.replace(k, v, 1)
ver = re.search(r"APP_VERSION = '([\d.]+)'", s).group(1)
open(os.path.join(D, 'docs', 'index.html'), 'w', encoding='utf-8').write(s)
sw = rd('sw.template.js').replace('__VERSION__', ver)
open(os.path.join(D, 'docs', 'sw.js'), 'w', encoding='utf-8').write(sw)
print('Đã tạo docs/index.html và docs/sw.js, phiên bản', ver)
