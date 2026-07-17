## [1.24.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.24.0...v1.24.1) (2026-07-17)


### Bug Fixes

* add database tools for export/import and system tools for version checks ([856061f](https://github.com/BFH-JTF/doc-pouch/commit/856061fdd67e14bfe94650867de32f940806fc21))

# [1.24.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.23.1...v1.24.0) (2026-07-17)


### Features

* enhance tools registration and resource templates, expand schema descriptions ([83a8709](https://github.com/BFH-JTF/doc-pouch/commit/83a8709e34a9007e905f3ac1d519d5a89cb23f61))

## [1.23.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.23.0...v1.23.1) (2026-07-14)


### Bug Fixes

* add missing rateLimiters and passwordGenerator modules ([90eaf39](https://github.com/BFH-JTF/doc-pouch/commit/90eaf3987305a54d0fa91c982c99f3002993cb7f))

# [1.23.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.22.0...v1.23.0) (2026-07-14)


### Bug Fixes

* add nodemailer dependency for SMTP support ([8ca2d04](https://github.com/BFH-JTF/doc-pouch/commit/8ca2d04ff4e12c4f5db7fc07f61552de400fd479))


### Features

* replace manual password entry with auto-generated passwords and admin reset ([ad1f169](https://github.com/BFH-JTF/doc-pouch/commit/ad1f16901493c747bb90a4f84e01e04e523cbd63))

# [1.22.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.21.1...v1.22.0) (2026-07-14)


### Bug Fixes

* delegate auth initialization and session restore to docpouch-client library ([734c637](https://github.com/BFH-JTF/doc-pouch/commit/734c637b606bddfb78a94f77c51ee1bf2823e772))
* improve error handling and type safety ([e2c6536](https://github.com/BFH-JTF/doc-pouch/commit/e2c65369d7998178fc7e16691c7d2793833bea24))
* remove default structure creation functionality ([e4a3451](https://github.com/BFH-JTF/doc-pouch/commit/e4a345143099b61e3f4b91b5f02d7cc0fc8c5801))


### Features

* add database inconsistency warning and improve logout handling ([322438e](https://github.com/BFH-JTF/doc-pouch/commit/322438e5f8452edf8f3a3064d54a9d9fa080a4b8))
* add email service for user notifications and hide passwords in API responses ([61584d3](https://github.com/BFH-JTF/doc-pouch/commit/61584d3f87d33e25468208e994f097b60533aa59))

## [1.21.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.21.0...v1.21.1) (2026-07-14)


### Bug Fixes

* **ci:** only update OpenAPI version when a new release is published ([2707966](https://github.com/BFH-JTF/doc-pouch/commit/2707966a582fc0efb5fb384b6555ff3c7a989457))
* **ci:** only update OpenAPI version when there are actual changes ([0f8dc40](https://github.com/BFH-JTF/doc-pouch/commit/0f8dc408239fcbcf7ff3becd4ca017d11f8ed547))

# [1.21.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.20.9...v1.21.0) (2026-07-05)


### Features

* add structure link support and parse document content as JSON ([8dbca6c](https://github.com/BFH-JTF/doc-pouch/commit/8dbca6ced2bf595532869bf2c038c97cfabdff0b))
* upgrade docpouch-client to v1.2.0 and delegate auth logic to library ([8b3ebcc](https://github.com/BFH-JTF/doc-pouch/commit/8b3ebcc49c790963a72bb21e37c1966d1c5e0e1b))

## [1.20.9](https://github.com/BFH-JTF/doc-pouch/compare/v1.20.8...v1.20.9) (2026-07-03)


### Bug Fixes

* add "Public document" UI indicator in DocumentPad.vue ([db888e2](https://github.com/BFH-JTF/doc-pouch/commit/db888e2b4d6884ebcf027d01f6303215fc8e17b1))
* add multi-select and bulk delete functionality to structure UI ([c5d5fcd](https://github.com/BFH-JTF/doc-pouch/commit/c5d5fcdfb76b4c61fdae4bc8a4a5bdbdd73a6cc8))
* add support for "object" field type in structure UI components ([b5cdd20](https://github.com/BFH-JTF/doc-pouch/commit/b5cdd202f24023e0efd3f4622307435805533c8d))
* handle server errors, improve caching, and add dynamic version checking ([e928651](https://github.com/BFH-JTF/doc-pouch/commit/e928651b5ccb59c226857401280bf1987480bdf0))

## [1.20.8](https://github.com/BFH-JTF/doc-pouch/compare/v1.20.7...v1.20.8) (2026-06-30)


### Bug Fixes


## [1.20.7](https://github.com/BFH-JTF/doc-pouch/compare/v1.20.6...v1.20.7) (2026-06-29)


### Bug Fixes

* enforce required fields for structure schemas and update dependencies ([9b5f5d8](https://github.com/BFH-JTF/doc-pouch/commit/9b5f5d8337a8ca3fb504b26c813bd680bdcdb812))

## [1.20.6](https://github.com/BFH-JTF/doc-pouch/compare/v1.20.5...v1.20.6) (2026-06-24)


### Bug Fixes

* add docPouch.png asset to project ([31cff34](https://github.com/BFH-JTF/doc-pouch/commit/31cff34ede17e38572f88cfd686db02401059b31))

## [1.20.5](https://github.com/BFH-JTF/doc-pouch/compare/v1.20.4...v1.20.5) (2026-06-24)


### Bug Fixes

* adjust asset path resolution and extend backend build script ([0a42cee](https://github.com/BFH-JTF/doc-pouch/commit/0a42cee6ed7a17c2974c7540bbedd0f927b80d31))

## [1.20.4](https://github.com/BFH-JTF/doc-pouch/compare/v1.20.3...v1.20.4) (2026-06-21)


### Bug Fixes

* remove outdated HTTP request templates and enhance example app** ([9585635](https://github.com/BFH-JTF/doc-pouch/commit/958563520933334cfc113c4419a0eaa552cca014))

## [1.20.3](https://github.com/BFH-JTF/doc-pouch/compare/v1.20.2...v1.20.3) (2026-06-19)


### Bug Fixes

* add structure propagation utilities and UI for handling document updates ([8f19642](https://github.com/BFH-JTF/doc-pouch/commit/8f19642c83c8cfd4f41a7004e4f337f03d5f574e))

## [1.20.2](https://github.com/BFH-JTF/doc-pouch/compare/v1.20.1...v1.20.2) (2026-06-19)


### Bug Fixes

* downgrade Vite to ^7.3.5 and update dependencies for compatibility ([1efdfd8](https://github.com/BFH-JTF/doc-pouch/commit/1efdfd8d765a2b19f4fc43e9f5ba25722b6773a6))

## [1.20.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.20.0...v1.20.1) (2026-06-19)


### Bug Fixes

* downgrade @vitejs/plugin-vue to ^6.0.7 to resolve compatibility issues ([177e690](https://github.com/BFH-JTF/doc-pouch/commit/177e69068a59bee9848df50cbd0112d496952331))
* update @vitejs/plugin-vue to v7 for Vite v8 compatibility ([1c0aa53](https://github.com/BFH-JTF/doc-pouch/commit/1c0aa5388dc00f34a32bc708a479092044b06f64))

# [1.20.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.19.0...v1.20.0) (2026-06-19)


### Features

* add dynamic sorting, document linking, and hover previews ([43b6f77](https://github.com/BFH-JTF/doc-pouch/commit/43b6f7779b2a25d467837c83fa5537e8cc2aa49d))
* add structure propagation handling and bulk document update support ([1f5f6f4](https://github.com/BFH-JTF/doc-pouch/commit/1f5f6f4cbba90b654c635eb90991e7104486f37d))

# [1.19.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.18.0...v1.19.0) (2026-06-15)


### Features

* add `closeOidcDatabases` for better OIDC test cleanup ([5ea3985](https://github.com/BFH-JTF/doc-pouch/commit/5ea3985a5b70af956e2c5e886e7dab48c4beda4a))
* add API Key Management UI, backend handling, and tests ([7990b4e](https://github.com/BFH-JTF/doc-pouch/commit/7990b4eebfa7eec43b6b013ad490e4a08cad1ef5))
* add safe file handling and improve `/users/login` endpoint behavior ([5b9fd05](https://github.com/BFH-JTF/doc-pouch/commit/5b9fd0598fc60a001523b7a420df0f2e9f78e6c3))
* implement OIDC enhancements, user tools, and SDK integration ([cba87c8](https://github.com/BFH-JTF/doc-pouch/commit/cba87c8b5074cc62e7b9bb858c857d6d9123e402))
* refactor MCP server initialization and enhance docPouch descriptions ([2613dd6](https://github.com/BFH-JTF/doc-pouch/commit/2613dd6e13ae67853e2935775068a207221b5778))

# [1.18.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.17.0...v1.18.0) (2026-06-14)


### Features

* add configurable session timeout for JWT and OIDC tokens ([67c8c00](https://github.com/BFH-JTF/doc-pouch/commit/67c8c00662395c516376f4e1c46e1baec02a80a2))
* enhance structure editing with array item categorization and validation ([e31b78a](https://github.com/BFH-JTF/doc-pouch/commit/e31b78a1259a6e671231a83cb2ae00eb69e091bb))

# [1.17.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.16.0...v1.17.0) (2026-06-13)


### Bug Fixes

* add rate limiting, safe file handling, and dependency updates ([9f6dccf](https://github.com/BFH-JTF/doc-pouch/commit/9f6dccfc1f0dc2bf96b3cf57bfbc67c24975bf6f))


### Features

* add CodeQL analysis workflow for improved security scanning ([742fb93](https://github.com/BFH-JTF/doc-pouch/commit/742fb9318a42bd117775cb03f83bab2b7b29417d))

# [1.16.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.15.1...v1.16.0) (2026-06-11)


### Features

* enhance OIDC logging, CORS handling, and session lifecycle management ([da15020](https://github.com/BFH-JTF/doc-pouch/commit/da15020edb3736cb4082c9968fb2ce81be1e386b))

## [1.15.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.15.0...v1.15.1) (2026-06-10)


### Bug Fixes

* improve TypeScript typing, simplify client display logic, and refine CSS styling ([4b23149](https://github.com/BFH-JTF/doc-pouch/commit/4b2314939742126fc75481bfbc59fc799d7a3ab5))

# [1.15.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.14.1...v1.15.0) (2026-06-09)


### Features

* add privacy guidelines and update configurations for anonymous document handling ([916b220](https://github.com/BFH-JTF/doc-pouch/commit/916b220a6de066f4424b25a7af5021265db15d6e))
* enhance logout handling with cancel flow and dynamic redirection ([a803092](https://github.com/BFH-JTF/doc-pouch/commit/a8030924822202d2cd244bf2d2c5f44ee5cba04a))
* implement anonymous document support with updated documentation ([73ec90f](https://github.com/BFH-JTF/doc-pouch/commit/73ec90ff0833a9ce6b215d831f3bffbe5c241815))
* improve logout flow with nested redirect URI extraction ([d520784](https://github.com/BFH-JTF/doc-pouch/commit/d520784cfa2e4aff6327e31bb89938a61f3f5db7))
* update dependencies, improve demo OIDC flow, and enhance logout handling ([ad0a138](https://github.com/BFH-JTF/doc-pouch/commit/ad0a138ad9cf5c0bada8f70cbb6ec7a553d284e3))
* upgrade demo to production-ready RP template with Vue, TypeScript, and real-time sync ([dd0347a](https://github.com/BFH-JTF/doc-pouch/commit/dd0347a90d40c898f1845df6412ee8036e77bb8c))

## [1.14.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.14.0...v1.14.1) (2026-06-06)


### Bug Fixes

* allow multi-selection for structure filtering in DocumentPad ([52f7472](https://github.com/BFH-JTF/doc-pouch/commit/52f7472d4a8888dc3a5343a7638e79959e275e24))
* resolve user update issues and improve error handling in NeDbWrapper ([c036f3b](https://github.com/BFH-JTF/doc-pouch/commit/c036f3b3bc4113d5f701dba42e4b0b206423fa27))

# [1.14.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.13.0...v1.14.0) (2026-06-06)


### Features

* introduce minimal OIDC Relying Party demo and enhance documentation ([44aa2ee](https://github.com/BFH-JTF/doc-pouch/commit/44aa2ee3304f272d39898930b9807ba875278acd))

# [1.13.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.12.0...v1.13.0) (2026-06-06)


### Features

* enhance OIDC flow, update dependencies, and improve logout handling ([c29b849](https://github.com/BFH-JTF/doc-pouch/commit/c29b849e719abf3f739b725ff620696dc6636649))
* enhance OIDC request and interaction debugging ([9a91cf0](https://github.com/BFH-JTF/doc-pouch/commit/9a91cf01a5dbc0a4ba287cbe85eab3c0d8db6419))
* improve logout flow with nested redirect URI extraction and enable client registration management ([38c48cf](https://github.com/BFH-JTF/doc-pouch/commit/38c48cf003aa7fba270387a6c4f4c7d3b92661c8))

# [1.12.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.11.0...v1.12.0) (2026-06-02)


### Features

* update dependencies and enhance OIDC logout flow ([a1415e8](https://github.com/BFH-JTF/doc-pouch/commit/a1415e8e25eb8134c1d76ad12081756bb26b0cbc))

# [1.11.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.10.0...v1.11.0) (2026-06-01)


### Bug Fixes

* improve StructureDisplay and StructureCreationDialog layout and update dependencies ([72c7849](https://github.com/BFH-JTF/doc-pouch/commit/72c78494bfa0d7f952a56d24a4b7adcb35e93275))


### Features

* add multi-select and bulk delete functionality to DocumentPad ([610606f](https://github.com/BFH-JTF/doc-pouch/commit/610606f9a9e7bc1a9afe19add76ce3385b945ce5))
* improve StructureCreationDialog styling for better readability ([3a5aae3](https://github.com/BFH-JTF/doc-pouch/commit/3a5aae31f4baef2a796be2d2b9c84471db1bb09d))

# [1.10.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.9.2...v1.10.0) (2026-05-31)


### Features

* enhance OIDC logout flow with custom confirmation and success pages ([a8049fa](https://github.com/BFH-JTF/doc-pouch/commit/a8049fa67a6415a952e79ed9ab0d3dcc434077fc))
* Implement OIDC logout with automatic redirect to client home page ([9109fcd](https://github.com/BFH-JTF/doc-pouch/commit/9109fcd141de9eaab2e5036f6c43083d8c0ae974))
* Implement OIDC-compliant logout with automatic redirect after logout ([bcd156d](https://github.com/BFH-JTF/doc-pouch/commit/bcd156d170ff14b4706fee848446811ba1eccaed))

## [1.9.2](https://github.com/BFH-JTF/doc-pouch/compare/v1.9.1...v1.9.2) (2026-05-27)


### Bug Fixes

* enable proxy trust for OIDC provider behind reverse proxy ([831cc18](https://github.com/BFH-JTF/doc-pouch/commit/831cc18855946dc05ccb05eae3a22f6c12c91176))

## [1.9.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.9.0...v1.9.1) (2026-05-27)


### Bug Fixes

* enforce secure OIDC cookie settings ([c2d75a5](https://github.com/BFH-JTF/doc-pouch/commit/c2d75a52e3581c0b0716731c26abfcb1d3cfb88e))

# [1.9.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.8.2...v1.9.0) (2026-05-26)


### Features

* add OIDC cookie security configuration and update dependencies ([c2f4384](https://github.com/BFH-JTF/doc-pouch/commit/c2f438439b03fee526cc27936339d0b03b448c18))

## [1.8.2](https://github.com/BFH-JTF/doc-pouch/compare/v1.8.1...v1.8.2) (2026-05-20)


### Bug Fixes

* enable trust proxy for OIDC behind reverse proxy ([8d200c1](https://github.com/BFH-JTF/doc-pouch/commit/8d200c19fb86b3a90b89af04c7cc340205a2bcfc))

## [1.8.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.8.0...v1.8.1) (2026-05-20)


### Bug Fixes

* add proxy: true to OIDC Provider for correct URL generation behind reverse proxy ([4fadf98](https://github.com/BFH-JTF/doc-pouch/commit/4fadf9806a935bc769270404224457868b885587))
* destroy OIDC session on logout to prevent auto-login ([349ed58](https://github.com/BFH-JTF/doc-pouch/commit/349ed588117c1f5db5a91bc4b6cffc9899bd2446))

# [1.8.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.7.1...v1.8.0) (2026-05-16)


### Bug Fixes

* add type assertions for req.params and include p field in JWK export ([1d52279](https://github.com/BFH-JTF/doc-pouch/commit/1d52279c048be588f56b762c4ebe9e4c9db96e1e))
* correcting package.json ([0455bf4](https://github.com/BFH-JTF/doc-pouch/commit/0455bf4f8338011f376fb1a9f4427b846293a545))
* correcting package.json ([dddf4c3](https://github.com/BFH-JTF/doc-pouch/commit/dddf4c343f70b19ea06c74c96f2cfd83eb4de148))
* persist OIDC state, fix Docker build, and improve OIDC login page ([79e811d](https://github.com/BFH-JTF/doc-pouch/commit/79e811d5ec80598dc0b91b93e015a2ca0502be67))
* remove unused [@types](https://github.com/types) dependencies and fix archiver import ([5fc1c31](https://github.com/BFH-JTF/doc-pouch/commit/5fc1c31c4012cbf74b1d73aee2c5031244cdf401))
* updating dependencies and updating package.json ([b206c42](https://github.com/BFH-JTF/doc-pouch/commit/b206c4291602e2b0f448750c17692d566c4775a9))


### Features

* add OIDC provider support with NeDB adapter and clean up legacy type components ([ed5aa48](https://github.com/BFH-JTF/doc-pouch/commit/ed5aa483f5b50a8bd2e0667133c544322e3fc7e5))
* implement OIDC authentication provider with JWT fallback ([5c02139](https://github.com/BFH-JTF/doc-pouch/commit/5c02139fe46a042be1b4bd897accb612a0bb4e0f))
* replace OIDC button with clickable banner image in login dialog ([4219a41](https://github.com/BFH-JTF/doc-pouch/commit/4219a41894acff097aa63bf9ec500c6013f658f0))
* replace OIDC button with clickable banner image in login dialog ([24d1bd8](https://github.com/BFH-JTF/doc-pouch/commit/24d1bd8249d8e219737acf18502abd663bb9296a))

## [1.7.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.7.0...v1.7.1) (2026-05-03)


### Bug Fixes

* handle case where there is nothing to commit in OpenAPI version update step ([833db08](https://github.com/BFH-JTF/doc-pouch/commit/833db084254df82fadb106f4c7bcdb44b441ad60))

# [1.7.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.6.0...v1.7.0) (2026-05-03)


### Features

* Added new functionalities to handle and manage document structures, including: ([8bf750d](https://github.com/BFH-JTF/doc-pouch/commit/8bf750d8ad246a6f8d31a862248af5eb64aa9600))

# [1.6.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.5.1...v1.6.0) (2026-05-02)


### Features

* Added new test files for database consistency checks. ([4ad1e90](https://github.com/BFH-JTF/doc-pouch/commit/4ad1e90408047a2e45b2bce43f0020bc4dd471e0))

## [1.5.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.5.0...v1.5.1) (2026-05-02)


### Bug Fixes

* add correct link to OpenAPI documentation ([ac25c5a](https://github.com/BFH-JTF/doc-pouch/commit/ac25c5a3c327df1373cb2a1c205dae444f290290))

# [1.5.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.4.2...v1.5.0) (2026-05-02)


### Bug Fixes

* remove document type management from API, OpenAPI spec, and documentation ([19dc166](https://github.com/BFH-JTF/doc-pouch/commit/19dc1664c3ee7cae88b5fe1e2ae85c042cf1f324))


### Features

* Added document structure creation in tests, ensuring consistency in event data verification for new and changed documents. Adjusted demo document attributes to reflect the new document structure paradigm. ([20ba4c7](https://github.com/BFH-JTF/doc-pouch/commit/20ba4c748d70a15182f5961d19b388934de48cc9))
* Introduce structure-based document management, replacing individual type/subtype with predefined data structures ([e2bcd23](https://github.com/BFH-JTF/doc-pouch/commit/e2bcd2333e3cd807778af61c92a381228f014ae1))

## [1.4.2](https://github.com/BFH-JTF/doc-pouch/compare/v1.4.1...v1.4.2) (2026-05-02)


### Bug Fixes

* uncomment Install Redoc CLI step in openapi-docs workflow ([dd93c9a](https://github.com/BFH-JTF/doc-pouch/commit/dd93c9ab38adbbd9829dc10096d3aef4bf1843c9))

## [1.4.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.4.0...v1.4.1) (2026-04-23)


### Bug Fixes

* remove unused `_id` and `expiresIn` fields from OpenAPI spec, add new socket event for database inconsistencies ([e1cfbf9](https://github.com/BFH-JTF/doc-pouch/commit/e1cfbf935d5e81a62bf93768e328a1b61bccb817))

# [1.4.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.3.4...v1.4.0) (2026-04-20)


### Bug Fixes

* update @vitejs/plugin-vue and @rolldown/pluginutils to latest versions ([5fe1843](https://github.com/BFH-JTF/doc-pouch/commit/5fe18437ecbc349ca8e5f06c3d1d07594c351927))


### Features

* add migration routine for adding `displayName` to structure fields (pre-1.3.4) ([9f5b7fc](https://github.com/BFH-JTF/doc-pouch/commit/9f5b7fc0f5cf1d88cffc3f8383dcf2c56f8dd3e2))
* improve database initialization and update dependencies ([aece4fe](https://github.com/BFH-JTF/doc-pouch/commit/aece4fec58486b2e0e7103aa7d3883317cd3758f))
* update OpenAPI spec to v1.3.4 with new endpoints, schema changes, and enhancements ([0680a64](https://github.com/BFH-JTF/doc-pouch/commit/0680a642446b39de084bf628f82bdad90ad25375))

## [1.3.4](https://github.com/BFH-JTF/doc-pouch/compare/v1.3.3...v1.3.4) (2026-04-15)


### Bug Fixes

* remove unused `credentials` field and reorder middleware setup ([257cdde](https://github.com/BFH-JTF/doc-pouch/commit/257cddef4078b467e15ca514c00402e0d6bfa17a))

## [1.3.3](https://github.com/BFH-JTF/doc-pouch/compare/v1.3.2...v1.3.3) (2026-04-09)


### Bug Fixes

* change default log to info ([e9475af](https://github.com/BFH-JTF/doc-pouch/commit/e9475af28e86439397af500ae284f98640a4783c))

## [1.3.2](https://github.com/BFH-JTF/doc-pouch/compare/v1.3.1...v1.3.2) (2026-04-09)


### Bug Fixes

* update GitHub workflows to use latest action versions ([cef3e3c](https://github.com/BFH-JTF/doc-pouch/commit/cef3e3c462c0928268cd65e42d3a50689180d279))

## [1.3.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.3.0...v1.3.1) (2026-04-08)


### Bug Fixes

* expand README with detailed configuration instructions ([5048abc](https://github.com/BFH-JTF/doc-pouch/commit/5048abc598048ad6cd6fa3fcd8bdf39cacdd88aa))

# [1.3.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.2.1...v1.3.0) (2026-04-08)


### Features

* add environment-based CORS and JWT secret configuration ([9a3aa3f](https://github.com/BFH-JTF/doc-pouch/commit/9a3aa3f756947bb46e4be0f0fbc0261a3b78eb2f))

## [1.2.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.2.0...v1.2.1) (2026-04-07)


### Bug Fixes

* removed unused import `helmet` ([132a929](https://github.com/BFH-JTF/doc-pouch/commit/132a9296b033699ff12e7dede0484e81b5a82196))

# [1.2.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.1.0...v1.2.0) (2026-04-07)


### Bug Fixes

* handle unauthorized export errors and update .gitignore ([fec880b](https://github.com/BFH-JTF/doc-pouch/commit/fec880b211b458be4e13fb3829b5cb01403ecb0f))
* improve test reliability and resolve TypeScript, Jest, and Node warnings ([35507d0](https://github.com/BFH-JTF/doc-pouch/commit/35507d0d543140c0d254b7fd016ce269aadea8af))
* update README with document types section and Docker usage guide ([be1db69](https://github.com/BFH-JTF/doc-pouch/commit/be1db69f4e21ffb3dce928c9baaede4eb3c96ff1))
* Update updateChecker utility to use JavaScript files instead of TypeScript. ([69b6daa](https://github.com/BFH-JTF/doc-pouch/commit/69b6daac16ac28807afe377a983892d4c4bd1d70))


### Features

* add database consistency check and admin alerts for faulty documents ([52c0af0](https://github.com/BFH-JTF/doc-pouch/commit/52c0af0502bf472cad29805f2f6742a28b266c21))
* add database migration logic for pre-1.1.0 updates ([7e45cbd](https://github.com/BFH-JTF/doc-pouch/commit/7e45cbdadfeea82bd476a6afd917777259791c01))
* add document access control and API update for public document fetching ([9d66d5f](https://github.com/BFH-JTF/doc-pouch/commit/9d66d5f5fc2cdd6bb3d46f598f0733841c219b24))
* add global setup and teardown for Jest tests ([1c65445](https://github.com/BFH-JTF/doc-pouch/commit/1c654456c5d9a97333a9c080abcef5829536101b))
* add update checker and improve version management ([49814a3](https://github.com/BFH-JTF/doc-pouch/commit/49814a3596c02386b68227e2fb2161c66aa5bea0))
* add UpdateAvailableDialog component for version update alerts ([f833321](https://github.com/BFH-JTF/doc-pouch/commit/f8333210a7bd8e0b097482b8d49570648bd907de))
* add updateChecker utility to check for version updates ([a9229c6](https://github.com/BFH-JTF/doc-pouch/commit/a9229c6cb5aebe2c6d8bfdb9172c5c10838e980b))
* enhance import/export functionality and update dependencies ([8927cb5](https://github.com/BFH-JTF/doc-pouch/commit/8927cb5272f2bf3f8a2a3420917f1a26eb3ddc12))
* enhance security with CSP middleware and Helmet integration ([b492084](https://github.com/BFH-JTF/doc-pouch/commit/b492084ee16863c34f7ee06331d33308c3b324ff))
* enhance server lifecycle management and database consistency checks ([67fe462](https://github.com/BFH-JTF/doc-pouch/commit/67fe4625106c6874adcf4dbbad381fac62c03366))
* update Vue and Vuetify dependencies, improve import logic ([9465554](https://github.com/BFH-JTF/doc-pouch/commit/9465554df013b8521f9cdc91603323c43264b7fc))

# [1.1.0](https://github.com/BFH-JTF/doc-pouch/compare/v1.0.4...v1.1.0) (2026-03-24)


### Features

* add database export support for in-memory mode ([b8c6df3](https://github.com/BFH-JTF/doc-pouch/commit/b8c6df32c0b30fd173c2b82ac779d7395d56f3ef))
* add Docker support and enhance NeDbWrapper initialization ([069cabd](https://github.com/BFH-JTF/doc-pouch/commit/069cabd4d934242434948e6f69a2ad629f36bddd))

## [1.0.4](https://github.com/BFH-JTF/doc-pouch/compare/v1.0.3...v1.0.4) (2026-03-23)


### Bug Fixes

* database was created in-memory when it should have been persistent ([abe8f82](https://github.com/BFH-JTF/doc-pouch/commit/abe8f826dbf01fd379eaeda10b4705025e41eadc))
* Merge remote-tracking branch 'origin/main' ([2f7eeed](https://github.com/BFH-JTF/doc-pouch/commit/2f7eeed04a20688c04edbe599e0f902b4a4c55e5))

## [1.0.3](https://github.com/BFH-JTF/doc-pouch/compare/v1.0.2...v1.0.3) (2026-03-23)


### Bug Fixes

* prevented cache issues during docker image build, added link to openAPI documentation to README.md ([49bc826](https://github.com/BFH-JTF/doc-pouch/commit/49bc826045e87bb66ef3e4fd70b7e673cb42a02d))

## [1.0.2](https://github.com/BFH-JTF/doc-pouch/compare/v1.0.1...v1.0.2) (2026-03-23)


### Bug Fixes

* correct package.json copy step in Dockerfile ([2672d34](https://github.com/BFH-JTF/doc-pouch/commit/2672d34bb80a17bad9a6b40d589fdd8b542b4897))

## [1.0.1](https://github.com/BFH-JTF/doc-pouch/compare/v1.0.0...v1.0.1) (2026-03-21)


### Bug Fixes

* add isAdmin and userName fields to login response ([b71a754](https://github.com/BFH-JTF/doc-pouch/commit/b71a75423c9b58755d99b3ca34615d0a08e46637))

# 1.0.0 (2026-03-21)


### Bug Fixes

* update loaded document reference when document changes ([a149744](https://github.com/BFH-JTF/doc-pouch/commit/a14974439df90d6cc43f7082bee40cc237293dc3))
