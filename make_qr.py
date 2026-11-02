import qrcode

URL = "https://digital-hunt.nmhd-expo.workers.dev/"
qrcode.make(URL).save("booth_qr.png")
print("Saved booth_qr.png ->", URL)