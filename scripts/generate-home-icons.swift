import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

// iOS supplies the Home Screen corner mask. Keep the PNG opaque and full-bleed.
let outputDirectory = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "public")
let font = CTFontCreateWithName("PingFangSC-Semibold" as CFString, 100, nil)
var character: UniChar = 0x6D41 // 流
var glyph: CGGlyph = 0
guard CTFontGetGlyphsForCharacters(font, &character, &glyph, 1),
      let path = CTFontCreatePathForGlyph(font, glyph, nil) else {
    fatalError("The installed font cannot render the Flow mark")
}
let bounds = path.boundingBoxOfPath

for (filename, size) in [("apple-touch-icon-flow.png", 180), ("icon-flow-192.png", 192), ("icon-flow-512.png", 512)] {
    guard let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
        bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.noneSkipLast.rawValue) else {
        fatalError("Cannot create icon canvas")
    }
    context.setFillColor(red: 20 / 255, green: 35 / 255, blue: 29 / 255, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: size, height: size))
    let scale = CGFloat(size) * 0.50 / max(bounds.width, bounds.height)
    context.translateBy(x: CGFloat(size) / 2, y: CGFloat(size) / 2)
    context.scaleBy(x: scale, y: scale)
    context.translateBy(x: -bounds.midX, y: -bounds.midY)
    context.setFillColor(red: 200 / 255, green: 241 / 255, blue: 104 / 255, alpha: 1)
    context.addPath(path)
    context.fillPath()
    guard let pixels = context.data?.assumingMemoryBound(to: UInt8.self) else { fatalError("Cannot validate pixels") }
    for (x, y) in [(0, 0), (size - 1, 0), (0, size - 1), (size - 1, size - 1)] {
        let offset = y * size * 4 + x * 4
        precondition(pixels[offset] == 20 && pixels[offset + 1] == 35 && pixels[offset + 2] == 29,
            "Background must reach every corner without a border")
    }
    var left = size, right = -1, top = size, bottom = -1
    for y in 0..<size {
        for x in 0..<size {
            let offset = y * size * 4 + x * 4
            guard pixels[offset] > 100 && pixels[offset + 1] > 150 else { continue }
            left = min(left, x); right = max(right, x)
            top = min(top, y); bottom = max(bottom, y)
        }
    }
    precondition(abs(Double(left + right + 1 - size)) <= 2 && abs(Double(top + bottom + 1 - size)) <= 2,
        "Visible mark must be centered within one pixel")
    let occupancy = Double(max(right - left + 1, bottom - top + 1)) / Double(size)
    precondition((0.48...0.52).contains(occupancy), "Mark size must remain consistent across icon sizes")
    guard let image = context.makeImage(), let destination = CGImageDestinationCreateWithURL(
        outputDirectory.appendingPathComponent(filename) as CFURL,
        UTType.png.identifier as CFString, 1, nil) else { fatalError("Cannot write icon") }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { fatalError("Cannot encode icon") }
    print("Generated \(filename): \(size)x\(size), opaque, centered mark")
}
