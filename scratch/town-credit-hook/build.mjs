import * as esbuild from '/Users/jacobhenderson/Desktop/lafayette-square.nosync/node_modules/esbuild/lib/main.js'
const H = process.argv[2]
await esbuild.build({ entryPoints: ['src/lib/sources.js'], bundle: true, format: 'esm', outfile: H + '/sources.bundle.mjs', logLevel: 'error',
  plugins: [{ name: 'mock', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: H + '/react-shim.js' }))
    b.onResolve({ filter: /\/slabUrl\.js$/ }, () => ({ path: H + '/slab-mock.js' }))
  } }] })
