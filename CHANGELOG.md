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
