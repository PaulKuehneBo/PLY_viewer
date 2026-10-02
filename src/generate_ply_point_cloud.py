from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

OUTPUT_DIR = Path(__file__).resolve().parent.parent
PLY_PATH = OUTPUT_DIR / "martin_like_point_cloud.ply"
IMAGE_PATH = OUTPUT_DIR / "martin_like_point_cloud.png"


def generate_martin_like_field(width: int = 600, height: int = 600) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Create a trig-based, fractal-like scalar field that resembles Martin/Mandel-type patterns.

    This is not a mathematically exact Martin set, but it follows the idea of generating
    interesting geometric patterns from trigonometric iterations and polar coordinates.
    """
    x = np.linspace(-2.8, 2.8, width)
    y = np.linspace(-2.8, 2.8, height)
    X, Y = np.meshgrid(x, y)

    R = np.hypot(X, Y)
    Theta = np.arctan2(Y, X)

    # A trigonometric field with repeated sin/cos terms to produce rich geometric patterns.
    field = np.sin(7.0 * X + 3.0 * np.cos(4.0 * Y))
    field += 0.55 * np.cos(9.0 * Y - 2.0 * np.sin(5.0 * X))
    field += 0.35 * np.sin(11.0 * R + Theta)
    field += 0.25 * np.cos(13.0 * X - 5.0 * Y)
    field *= 0.8

    return X, Y, field


def generate_point_cloud(field: np.ndarray, threshold: float = 0.7) -> np.ndarray:
    """Keep only the strongest points to form a point cloud of the pattern."""
    mask = field > threshold

    X, Y = np.where(mask)
    x_coords = (X / field.shape[0] - 0.5) * 10.0
    y_coords = (Y / field.shape[1] - 0.5) * 10.0
    z_coords = field[mask]

    points = np.column_stack([x_coords, y_coords, z_coords])
    return points


def colorize_field(field: np.ndarray) -> np.ndarray:
    """Map scalar values to a colorful OpenCV image."""
    normalized = cv2.normalize(field, None, 0, 255, cv2.NORM_MINMAX)
    img_uint8 = normalized.astype(np.uint8)
    return cv2.applyColorMap(img_uint8, cv2.COLORMAP_JET)


def write_ply(path: Path, points: np.ndarray, colors: np.ndarray | None = None) -> None:
    """Write an ASCII PLY point cloud."""
    if colors is None:
        colors = np.full((len(points), 3), 255, dtype=np.uint8)

    with path.open("w", encoding="utf-8") as f:
        f.write("ply\n")
        f.write("format ascii 1.0\n")
        f.write(f"element vertex {len(points)}\n")
        f.write("property float x\n")
        f.write("property float y\n")
        f.write("property float z\n")
        f.write("property uchar red\n")
        f.write("property uchar green\n")
        f.write("property uchar blue\n")
        f.write("end_header\n")

        for point, color in zip(points, colors):
            x, y, z = point
            r, g, b = color
            f.write(f"{x:.6f} {y:.6f} {z:.6f} {int(r)} {int(g)} {int(b)}\n")

    print(f"Saved PLY file: {path} with {len(points)} vertices.")


def build_colors_from_field(field: np.ndarray, points: np.ndarray) -> np.ndarray:
    """Generate RGB colors for the selected point cloud based on the scalar field."""
    mask = field > 0.7
    X, Y = np.where(mask)
    color_map = np.zeros((len(points), 3), dtype=np.uint8)

    values = field[mask]
    normalized = cv2.normalize(values.astype(np.float32), None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    rgb = cv2.applyColorMap(normalized, cv2.COLORMAP_JET)
    color_map[:, :] = rgb.reshape(-1, 3)
    return color_map


def main_martin() -> None:
    X, Y, field = generate_martin_like_field(width=512, height=512)
    image = colorize_field(field)
    cv2.imwrite(str(IMAGE_PATH), image)

    mask = field > 0.72
    selected_x = X[mask]
    selected_y = Y[mask]
    selected_z = field[mask]

    points = np.column_stack(
        [
            (selected_x - selected_x.mean()) * 0.12,
            (selected_y - selected_y.mean()) * 0.12,
            selected_z * 1.6,
        ]
    )

    colors = cv2.applyColorMap(
        cv2.normalize(selected_z.astype(np.float32), None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8),
        cv2.COLORMAP_JET,
    )

    write_ply(PLY_PATH, points, colors.reshape(-1, 3))

    print(f"Saved point cloud: {PLY_PATH}")
    print(f"Saved image: {IMAGE_PATH}")
    print(f"Vertices: {len(points)}")


GLOBE_IMAGE_PATH = Path(r"D:\SB\MyVSCodeExtensions\images\globe-atlas-background-1.jpg")


def main() -> None:
    print("Generate Kugel-Point-Cloud")
    globe_image = cv2.imread(str(GLOBE_IMAGE_PATH))
    if globe_image is None:
        print(f"Failed to load image: {GLOBE_IMAGE_PATH}")
        return

    globe_image = cv2.cvtColor(globe_image, cv2.COLOR_BGR2RGB)

    height, width, _ = globe_image.shape

    # create the point cloud in spherical coordinates
    # runs a random sampling of points on the sphere and maps them to the image
    num_points = 100000
    # for each point, generate a random spherical coordinate (theta, phi) and map to the image
    theta = np.random.uniform(0, 2 * np.pi, num_points)
    phi = np.random.uniform(0, np.pi, num_points)
    # convert spherical coordinates to Cartesian coordinates
    x = np.sin(phi) * np.cos(theta)
    y = np.sin(phi) * np.sin(theta)
    z = np.cos(phi)

    # map the spherical coordinates to image coordinates
    u = ((theta / (2 * np.pi)) * width).astype(int) % width
    v = ((phi / np.pi) * height).astype(int) % height

    # get the colors from the image
    colors = globe_image[v, u]

    # create the point cloud
    points = np.column_stack((x, y, z))

    ply_path = GLOBE_IMAGE_PATH.with_name("globe.ply")
    write_ply(ply_path, points, colors)


if __name__ == "__main__":
    main()
