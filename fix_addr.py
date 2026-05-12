
file = r'e:\vivpr\ai\browser\src\main.js'
with open(file, 'r', encoding='utf-8') as f:
    content = f.read()

old = r'const enAddressRegex = /\\\\d{1,5}\\\\s[A-Za-z0-9\\\\s.,-]+(?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Plaza|Square|Suite|Ste|Unit)[.,\\\\s]+[A-Za-z\\\\s]+[.,\\\\s]+[A-Z]{2}[\\\\s,]+\\\\d{5}/gi;'
new = '// Canada(A1A 1A1) + USA(12345) + generic street address\n                const enAddressRegex = /\\\\d{1,5}[,\\\\s]+[A-Za-z0-9\\\\s.]+(?:Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Plaza|Square|Suite|Ste|Unit|Boul|Rue|Route)[,\\\\s]+[A-Za-z\\\\s]+[,\\\\s]+(?:[A-Z]{2}[\\\\s,]+[0-9]{5}|[A-Z][0-9][A-Z]\\\\s?[0-9][A-Z][0-9])/gi;'

if old in content:
    content = content.replace(old, new, 1)
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK - replaced at line ~714')
else:
    print('NOT FOUND - searching...')
    idx = content.find('enAddressRegex')
    print(repr(content[idx:idx+300]))
