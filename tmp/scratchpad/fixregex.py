p='js/store.js'
s=open(p).read()
old="if (!/^\\\\d{4,6}$/.test"
new="if (!/^\\d{4,6}$/.test"
assert old in s, 'old not found'
s=s.replace(old,new)
open(p,'w').write(s)
print('ok')
EOF