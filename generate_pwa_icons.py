import os
from PIL import Image

# Open logo.png with transparent background
img = Image.open('logo.png').convert('RGBA')

# Crop tightly to the actual emblem and text content
bbox = img.getbbox()
print("Original bbox:", bbox)
cropped = img.crop(bbox)
w, h = cropped.size
print("Cropped size:", w, h)

# Make it a square by adding minimal proportional padding (10% padding for safe area on mobile)
max_dim = max(w, h)
target_dim = int(max_dim * 1.15) # 7.5% safe margin on each side so mobile launchers don't clip the edges

square_img = Image.new("RGBA", (target_dim, target_dim), (0, 0, 0, 0))
offset = ((target_dim - w) // 2, (target_dim - h) // 2)
square_img.paste(cropped, offset, cropped)

# Generate Icons
os.makedirs("static/assets", exist_ok=True)

# 1. 192x192
icon_192 = square_img.resize((192, 192), Image.Resampling.LANCZOS)
icon_192.save("static/assets/icon-192.png", format="PNG")

# 2. 512x512
icon_512 = square_img.resize((512, 512), Image.Resampling.LANCZOS)
icon_512.save("static/assets/icon-512.png", format="PNG")

# 3. Apple Touch Icon 180x180 (iOS requires solid background)
apple_bg = Image.new("RGBA", (180, 180), (255, 255, 255, 255))
apple_inner = square_img.resize((160, 160), Image.Resampling.LANCZOS)
apple_bg.paste(apple_inner, (10, 10), apple_inner)
apple_bg.convert("RGB").save("static/assets/apple-touch-icon.png", format="PNG")

# 4. Favicon 64x64
fav = square_img.resize((64, 64), Image.Resampling.LANCZOS)
fav.save("static/assets/favicon.png", format="PNG")

# 5. Maskable Icons (on clean white or solid background for Android adaptive icons without any green frame)
def create_maskable(size, out_path):
    bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    inner_size = int(size * 0.85)
    inner_img = square_img.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
    offset = ((size - inner_size) // 2, (size - inner_size) // 2)
    bg.paste(inner_img, offset, inner_img)
    bg.save(out_path, format="PNG")

create_maskable(192, "static/assets/icon-maskable-192.png")
create_maskable(512, "static/assets/icon-maskable-512.png")

print("Generated crisp, full-size PWA icons without borders!")
