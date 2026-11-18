# Showcase sample image credits

Sample photography for the Showcase template preview lives in this folder. All
photos are from [Unsplash](https://unsplash.com) and are self-hosted as WebP so
previews load fast and never hotlink.

Replacing a file? Keep the same name, size, and aspect ratio:

| Slot | File | Size | Purpose |
|------|------|------|---------|
| Menu | `menu-*.webp` | 800×600 | Catalog and home-strip cards |
| Promo | `promo-*.webp` | 1200×900 | Promotion carousel slides |
| About | `about-chef.webp` | 1000×1250 | About split-section photo |

## Photos

| Slot | File | Alt text | Photographer | Unsplash page |
|------|------|----------|--------------|---------------|
| Soup | `menu-soup.webp` | Bowl of vegetable soup with fresh herbs | Ella Olsson | https://unsplash.com/photos/soup-in-bowl-fxJTl_gDh28 |
| Rice bowl | `menu-rice-bowl.webp` | Rice bowl with vegetables and herbs | Annie Spratt | https://unsplash.com/photos/bowl-of-fried-rice-oT7_v-I0hHg |
| Fried rice | `menu-fried-rice.webp` | Fried rice with peas and carrots on a plate | Christopher Alvarenga | https://unsplash.com/photos/fried-rice-with-peas-and-carrots-rQX9eVpSFz8 |
| Steak | `menu-steak.webp` | Seared steak served on a bed of green salad | Justus Menke | https://unsplash.com/photos/seared-steak-on-green-salad-62XLglIrTJc |
| Grilled chicken | `menu-grilled-chicken.webp` | Grilled chicken with vegetables and flatbread | Husien Bisky | https://unsplash.com/photos/grilled-chicken-with-vegetables-and-flatbread-on-a-plate-Xfq9nVqVl7Y |
| Burger | `menu-burger.webp` | Burger with lettuce, tomato and cheese | amirali mirhashemian | https://unsplash.com/photos/burger-with-lettuce-and-tomatoes-sc5sTPMrVfk |
| Chocolate cake | `menu-chocolate-cake.webp` | Slice of layered chocolate cake with cream and cherries | Jacob Thomas | https://unsplash.com/photos/chocolate-cake-with-cherries-and-cream-6jHpcBPw7i8 |
| Latte | `menu-latte.webp` | Barista pouring latte art into a cup | Fahmi Fakhrudin | https://unsplash.com/photos/person-making-latte-art-nzyzAUsbV0M |
| Dining room | `promo-dining-room.webp` | Warm dining room with wooden tables and pendant lights | Jason Leung | https://unsplash.com/photos/photo-of-pub-set-in-room-during-daytime-poI7DelFiVA |
| Sharing table | `promo-sharing-table.webp` | Table set with several plates of food to share | Stefan Vladimirov | https://unsplash.com/photos/white-plates-with-assorted-foods-Q_Moi2xjieU |
| Cocktail | `promo-cocktail.webp` | Cocktail garnished with lime and rosemary | No Revisions | https://unsplash.com/photos/cocktail-with-lime-and-rosemary-garnish-gA81ZTsql68 |
| About / chef | `about-chef.webp` | Chef preparing food at a kitchen counter | Louis Hansel | https://unsplash.com/photos/man-preparing-food-v3OlBE6-fhU |

## License

Unsplash photos are free to use under the [Unsplash License](https://unsplash.com/license).
Attribution is not required by the license but is recorded here for review.
These files are template sample assets only: live sites render the owner's own
photos and never these.

## Regenerating

The source images were downloaded from `images.unsplash.com` at 2× the target
width, then cropped to the slot size with `sharp` (`fit: cover`) and encoded as
WebP (menu quality 74, promo/about quality 78). Each URL was confirmed to return
HTTP 200 with an image content type before conversion.
