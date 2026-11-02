import qrcode

URL = "https://azyaan12.github.io/wellbeing-booth/"
qrcode.make(URL).save("booth_qr.png")
print("Saved booth_qr.png ->", URL)