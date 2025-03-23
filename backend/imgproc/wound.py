import cv2 as cv
import numpy as np


def prewitt(img, thresh):
    """Perform a modified (incl. diagonal) Prewitt edge detection filter"""
    temp = img.astype(np.float32)
    m1 = np.array([
        [-1,  0,  1], 
        [-1,  0,  1], 
        [-1,  0,  1]
    ])
    m2 = np.array([
        [-1, -1,  0], 
        [-1,  0,  1], 
        [ 0,  1,  1]
    ])
    gx = cv.filter2D(img, ddepth=-1, kernel=m1)
    gy = cv.filter2D(img, ddepth=-1, kernel=np.transpose(m1))
    gd1 = cv.filter2D(img, ddepth=-1, kernel=m2)
    gd2 = cv.filter2D(img, ddepth=-1, kernel=np.rot90(m2))
    edges1 = np.hypot(gx, gy) >= thresh
    edges2 = np.hypot(gd1, gd2) >= thresh
    return (edges1 | edges2).astype(np.uint8) * 255


def blur(img, blur_size=3):
    return cv.blur(img, (3, 3))


def edges(img, blur_size=3, edge_threshold=8):
    """Blur + edge detect"""
    img_blur = blur(img, blur_size=blur_size)
    return prewitt(img_blur, edge_threshold)


def wound_mask(img, blur_size=3, edge_threshold=6, morphology_size=40):
    """Find the mask of the wound"""
    return cv.morphologyEx(
        edges(img, blur_size=blur_size, edge_threshold=edge_threshold), 
        cv.MORPH_CLOSE, 
        cv.getStructuringElement(cv.MORPH_ELLIPSE, (morphology_size, morphology_size))
    )


def wound_contours(img=None, mask=None, approx=None, min_size_threshold=0.005):
    """Find the contours of the wound"""
    if mask is None:
        assert img is not None, "wound_contours requires img or mask"
        mask = wound_mask(img)

    contours, _ = cv.findContours(
        cv.bitwise_not(mask), 
        cv.RETR_EXTERNAL, 
        cv.CHAIN_APPROX_SIMPLE
    )

    contours = [
        c for c in contours 
        if cv.contourArea(c) >= min_size_threshold*img.shape[0]*img.shape[1]
    ]

    if approx is not None:
        for i, c in enumerate(contours):
            contours[i] = cv.approxPolyDP(c, approx, True)

    return [c.reshape((c.shape[0], 2)) for c in contours]


def cut_out(img, contours):
    """Convert contours to a mask"""
    mask = np.zeros(img.shape, np.uint8)
    cv.drawContours(mask, contours, -1, 255, -1)
    return img * (mask == 255)


def free_cells(img, contours, approx=None, min_size_threshold=0.00005, edge_threshold=10, open_size=3, close_size=30):
    """Locate free cells inside a wound contour with area >= min_size_threshold*img.shape[0]*img.shape[1]"""

    wound = cut_out(img, contours)
    edges_inner = prewitt(wound, edge_threshold)
    outline = cv.drawContours(
        np.zeros(img.shape, np.uint8), 
        contours, 
        -1, 255, 2
    )

    inner = edges_inner-outline
    inner = cv.morphologyEx(
        inner, 
        cv.MORPH_OPEN, 
        cv.getStructuringElement(cv.MORPH_ELLIPSE, (open_size, open_size))
    )
    _, inner = cv.threshold(inner, 127, 255, cv.THRESH_BINARY)

    morph_inner = cv.morphologyEx(
        inner, 
        cv.MORPH_CLOSE, 
        cv.getStructuringElement(cv.MORPH_ELLIPSE, (close_size, close_size))
    )

    contours_inner, _ = cv.findContours(morph_inner, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    return [
        (cv.approxPolyDP(c, approx, True)[:, 0] if approx else c[:, 0]) 
        for c in contours_inner 
        if cv.contourArea(c) >= min_size_threshold*img.shape[0]*img.shape[1]
    ]
