# Bugfix Requirements Document

## Introduction

The GlobalHeader card component is blocking user interaction with MapLibre GL JS map controls (zoom in/out buttons and compass navigation). This prevents users from accessing essential map navigation functionality when the header is visible. The issue is caused by the header card's positioning and z-index layering, which places it above the map controls in the stacking context.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the GlobalHeader is visible and positioned over the map controls THEN the header card blocks click events on the zoom in/out buttons

1.2 WHEN the GlobalHeader is visible and positioned over the map controls THEN the header card blocks click events on the compass control

1.3 WHEN the GlobalHeader is visible and positioned over the map controls THEN users cannot interact with any map navigation controls that are visually obscured by the header

### Expected Behavior (Correct)

2.1 WHEN the GlobalHeader is visible THEN the map controls SHALL remain fully interactive and clickable

2.2 WHEN the GlobalHeader is visible THEN the header card SHALL NOT block pointer events to map controls

2.3 WHEN the GlobalHeader is visible THEN the z-index layering SHALL ensure map controls appear above or remain accessible despite the header's presence

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the GlobalHeader is visible THEN the header card SHALL CONTINUE TO display all its content (title, badges, theme toggle, language selector, dismiss button)

3.2 WHEN the GlobalHeader is dismissed THEN the header SHALL CONTINUE TO be hidden from view

3.3 WHEN users interact with header controls (theme toggle, language selector, dismiss button) THEN these interactions SHALL CONTINUE TO function correctly

3.4 WHEN the header is visible on mobile devices THEN the mobile info toggle SHALL CONTINUE TO work as expected

3.5 WHEN the desktop panel toggle button is visible THEN it SHALL CONTINUE TO function independently of the header

3.6 WHEN the header has backdrop blur and transparency effects THEN these visual styles SHALL CONTINUE TO render correctly
