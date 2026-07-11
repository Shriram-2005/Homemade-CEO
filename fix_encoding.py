path = r'D:\Saina Human AI\Homemade CEO\Prototype\js\chat-ui.js'

with open(path, 'rb') as f:
    raw = f.read()

# These are the UTF-8 encoded bytes of the garbled sequences as they appear in the file
# 'â‚¹' stored in UTF-8 = the 3-char string where each char was independently UTF-8 stored
bad_rupee = 'â\u0082¹'.encode('utf-8')   # the garbled rupee
good_rupee = '\u20b9'.encode('utf-8')     # correct ₹

print('Looking for:', bad_rupee.hex())
print('Found:', raw.count(bad_rupee), 'times')

fixed = raw.replace(bad_rupee, good_rupee)

# Also fix Â· -> middle dot
bad_dot  = 'Â·'.encode('utf-8')
good_dot = '\u00b7'.encode('utf-8')
fixed = fixed.replace(bad_dot, good_dot)

with open(path, 'wb') as f:
    f.write(fixed)
print('Done')
