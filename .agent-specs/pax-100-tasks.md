# PAX — 100 Task List (Direct Work, No Subagents)

Boss order 2026-10-01: Work through 100 tasks. Push to GitHub per completed task.
Each task is one concrete, verifiable unit. No placeholders.

## A. Ragdoll Integration (1-15)
1. [ ] Port working ragdoll recipe (6DoF limits, 18 bones) into clients/campaign/src/physics/ragdoll.ts
2. [ ] Add Havok physics init to battle scene
3. [ ] Wire ragdoll trigger on soldier death in battle
4. [ ] Add death impulse based on damage direction
5. [ ] Test ragdoll with 5 soldiers simultaneously
6. [ ] Add ragdoll cleanup/dispose on battle end
7. [ ] Tune joint limits for natural fall poses
8. [ ] Add ground collision offset (12cm) to battle physics
9. [ ] Verify ragdoll works with operator models (not just Soldier.glb)
10. [ ] Add ragdoll for horse model on death
11. [ ] Performance test: 20 ragdolls, measure FPS
12. [ ] Add settings toggle for ragdoll on/off
13. [ ] Document ragdoll API in code comments
14. [ ] Fix any tsc errors in new ragdoll code
15. [ ] Push ragdoll integration, verify build

## B. Finger Fix (16-25)
16. [ ] Inspect all 5 operator GLBs for finger bone channels
17. [ ] Identify which clips have finger animation vs static
18. [ ] Create runtime finger curl pose for grip
19. [ ] Apply finger curl to idle animations
20. [ ] Apply finger curl to aim animations
21. [ ] Test finger fix on Viper model
22. [ ] Test finger fix on all 5 operators
23. [ ] Screenshot close-up hands before/after
24. [ ] Push finger fix
25. [ ] Verify no regressions in animation tests

## C. Animation System (26-40)
26. [ ] Fix 9 tsc errors in AnimationController.ts (Rowan flagged)
27. [ ] Fix tsc errors in AudioAnimationBridge.ts
28. [ ] Fix tsc errors in ModelLoader.ts
29. [ ] Fix models.test.ts GLB count (expects 30, 49 on disk)
30. [ ] Add missing block/parry animation hook
31. [ ] Add cheer/victory animation trigger
32. [ ] Add surrender/hands-up animation trigger
33. [ ] Add hit-react animation blending
34. [ ] Improve animation transition smoothing
35. [ ] Add animation speed scaling for sprint vs walk
36. [ ] Verify all 38 operator clips load correctly
37. [ ] Add animation LOD (skip finger bones at distance)
38. [ ] Profile animation system performance
39. [ ] Document animation clip mapping
40. [ ] Push animation fixes, verify build

## D. Models & Assets (41-55)
41. [ ] Verify horse.glb loads in game (not just demo)
42. [ ] Add horse to model manifest if missing
43. [ ] Test operator-heron crouch_idle screenshot
44. [ ] Test operator-lynx crouch_idle screenshot
45. [ ] Test operator-magpie crouch_idle screenshot
46. [ ] Verify all 49 models in manifest load
47. [ ] Check model file sizes, flag any >10MB
48. [ ] Verify LICENSES.md covers all models
49. [ ] Add missing model categories if needed
50. [ ] Test model loading performance (49 models)
51. [ ] Fix any broken model references
52. [ ] Add model preload for battle scene
53. [ ] Verify civilian model variety (need more than 1)
54. [ ] Document model pipeline for new assets
55. [ ] Push model fixes

## E. Battle Scene (56-70)
56. [ ] Battle scene bootstrap (separate from campaign)
57. [ ] Plains biome template
58. [ ] Forest biome template
59. [ ] Urban biome template
60. [ ] Deployment phase UI
61. [ ] Battle camera (follow + free-look)
62. [ ] Battle minimap
63. [ ] Battle intro screen
64. [ ] Battle outro (victory/defeat)
65. [ ] Return to campaign (casualties, loot)
66. [ ] Weather overlay (rain/fog/clear)
67. [ ] Time-of-day lighting
68. [ ] Snow biome
69. [ ] Desert biome
70. [ ] Push battle scene work

## F. Audio (71-80)
71. [ ] Audit current audio assets (109 from milo)
72. [ ] Wire battle sounds (shots, hits, deaths)
73. [ ] Wire UI sounds (clicks, menu)
74. [ ] Add ambient battle audio
75. [ ] Test audio loading performance
76. [ ] Add volume controls
77. [ ] Add mute toggle
78. [ ] Fix any audio loading errors
79. [ ] Document audio pipeline
80. [ ] Push audio work

## G. Polish & Fixes (81-100)
81. [ ] Fix any tsc errors in my lane
82. [ ] Run full client test suite, fix failures
83. [ ] Verify build passes
84. [ ] Check bundle size, optimize if >5MB
85. [ ] Add loading screen for battle
86. [ ] Improve error handling in model loader
87. [ ] Add retry logic for failed model loads
88. [ ] Test on mobile viewport
89. [ ] Fix any mobile layout issues
90. [ ] Add keyboard shortcuts documentation
91. [ ] Verify all crew's recent commits don't break my lane
92. [ ] Run Playwright smoke test on battle scene
93. [ ] Fix any smoke test failures
94. [ ] Update MASTER_PLAN if needed
95. [ ] Clean up dead code in animations/
96. [ ] Verify no console errors on load
97. [ ] Test with 100 soldiers on screen
98. [ ] Final tsc + build + test verification
99. [ ] Write summary of all 100 tasks completed
100. [ ] Final push, confirm GitHub main is green

---
Progress: 0/100
Started: 2026-10-01
