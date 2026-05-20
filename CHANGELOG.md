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
