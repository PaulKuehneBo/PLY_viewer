#!/usr/bin/env python3

import math

OUTPUT_FILE = "test_gaussian_splats.ply"
SPLAT_COUNT = 1200
SPHERE_RADIUS = 1.0
SPLAT_DIAMETER = 0.13
SURFACE_ALPHA = 1.0 / (1.0 + math.exp(-3.0))
HOLE_ALPHA = 1.0 / (1.0 + math.exp(8.0))
HOLE_RADIUS = math.radians(20)
HOLE_FEATHER = math.radians(30)
SH_C0 = 0.28209479177387814


def smoothstep(start: float, end: float, value: float) -> float:
    t = max(0.0, min(1.0, (value - start) / (end - start)))
    return t * t * (3.0 - 2.0 * t)


def alpha_to_logit(alpha: float) -> float:
    bounded_alpha = max(1e-6, min(1.0 - 1e-6, alpha))
    return math.log(bounded_alpha / (1.0 - bounded_alpha))


def generate_vertices() -> list[tuple[float, ...]]:
    vertices = []
    golden_angle = math.pi * (3.0 - math.sqrt(5.0))

    for index in range(SPLAT_COUNT):
        y_unit = 1.0 - 2.0 * (index + 0.5) / SPLAT_COUNT
        ring_radius = math.sqrt(1.0 - y_unit * y_unit)
        angle = index * golden_angle
        x_unit = math.cos(angle) * ring_radius
        z_unit = math.sin(angle) * ring_radius

        x = SPHERE_RADIUS * x_unit
        y = SPHERE_RADIUS * y_unit
        z = SPHERE_RADIUS * z_unit

        south_to_north = (y_unit + 1.0) * 0.5
        red = south_to_north
        green = 0.0
        blue = 1.0 - south_to_north

        hole_angle = math.acos(max(-1.0, min(1.0, z_unit)))
        hole_blend = smoothstep(HOLE_RADIUS, HOLE_RADIUS + HOLE_FEATHER, hole_angle)
        alpha = HOLE_ALPHA + (SURFACE_ALPHA - HOLE_ALPHA) * hole_blend
        opacity = alpha_to_logit(alpha)

        vertices.append((x, y, z, red, green, blue, opacity))

    return vertices


def write_ply(vertices: list[tuple[float, ...]]) -> None:
    with open(OUTPUT_FILE, "w", encoding="ascii") as ply_file:
        ply_file.write("ply\n")
        ply_file.write("format ascii 1.0\n")
        ply_file.write(f"element vertex {len(vertices)}\n")
        ply_file.write("property float x\n")
        ply_file.write("property float y\n")
        ply_file.write("property float z\n")
        ply_file.write("property float nx\n")
        ply_file.write("property float ny\n")
        ply_file.write("property float nz\n")
        ply_file.write("property float f_dc_0\n")
        ply_file.write("property float f_dc_1\n")
        ply_file.write("property float f_dc_2\n")
        ply_file.write("property float opacity\n")
        ply_file.write("property float scale_0\n")
        ply_file.write("property float scale_1\n")
        ply_file.write("property float scale_2\n")
        ply_file.write("property float rot_0\n")
        ply_file.write("property float rot_1\n")
        ply_file.write("property float rot_2\n")
        ply_file.write("property float rot_3\n")
        ply_file.write("end_header\n")

        scale = math.log(SPLAT_DIAMETER)
        for x, y, z, red, green, blue, opacity in vertices:
            f_dc_red = (red - 0.5) / SH_C0
            f_dc_green = (green - 0.5) / SH_C0
            f_dc_blue = (blue - 0.5) / SH_C0
            ply_file.write(
                f"{x:.6f} {y:.6f} {z:.6f} "
                "0 0 0 "
                f"{f_dc_red:.6f} {f_dc_green:.6f} {f_dc_blue:.6f} "
                f"{opacity:.6f} "
                f"{scale:.6f} {scale:.6f} {scale:.6f} "
                "1 0 0 0\n"
            )


if __name__ == "__main__":
    write_ply(generate_vertices())
    print(f"geschrieben: {OUTPUT_FILE}")
