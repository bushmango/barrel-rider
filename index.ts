import * as bodyParser from 'body-parser'
import * as cors from 'cors'
import * as express from 'express'
import * as fs from 'fs'
import * as watch from 'glob-watcher'
import * as _ from 'lodash'
import * as path from 'path'
import { glob } from 'glob'

console.log('The Barrel-Rider -- Create Typescript Index Files')

import * as commandLineArgs from 'command-line-args'
import * as commandLineUsage from 'command-line-usage'

const sections = [
  {
    header: 'The Barrel-Rider',
    content: 'Creates Typescript index files',
  },
  {
    header: 'Options',
    optionList: [
      {
        name: 'src',
        typeLabel: '{underline directories}',
        description: 'The directories to scan (globs).',
      },
      {
        name: 'watch',
        typeLabel: '{underline Boolean}',
        description:
          'Keep this process open and rebuild files when they change.',
      },
      {
        name: 'port',
        typeLabel: '{underline Number}',
        description: 'Port to use for the watch server.',
      },
      {
        name: 'help',
        description: 'Print this usage guide.',
      },
    ],
  },
]

// import { promisify } from 'util'
// const readFileAsync = promisify(fs.readFile)
// const writeFileAsync = promisify(fs.writeFile)

function run() {
  const optionDefinitions = [
    { name: 'help', alias: 'h', type: Boolean },
    { name: 'verbose', alias: 'v', type: Boolean },
    {
      name: 'src',
      alias: 's',
      type: String,
      multiple: true,
      defaultOption: true,
    },
    { name: 'watch', alias: 'w', type: Boolean },
    { name: 'port', alias: 'p', type: Number },
  ]
  const options = commandLineArgs(optionDefinitions)

  let valid = options.help || (options.src && options.src.length)
  if (!options.watch) {
    console.log('Sorry, currently only works in watch mode!')
    valid = false
  }

  if (!valid || options.help) {
    // console.log('!! invalid options !!')
    const usage = commandLineUsage(sections)
    console.log(usage)
    return
  }

  const indexesToRebuild: string[] = []

  function rebuildIndex(_path: string) {
    if (
      _path.endsWith('index.ts') ||
      _path.endsWith('index.tsx') ||
      _path.includes('node_modules')
    ) {
      return // This shouldn't trigger rebuilding of indexes
    }
    let folder = path.dirname(_path)
    if (!_.includes(indexesToRebuild, folder)) {
      indexesToRebuild.push(folder)
    }
    rebuildIndexesThrottled()
  }

  function rebuildIndexes() {
    // console.log('should build index', indexesToRebuild)
    _.forEach(indexesToRebuild, (_path) => {
      glob(_path + '/*.@(ts|tsx)', (err, files) => {
        console.log('building barrel index for', _path)

        let lines = []
        lines.push('// THIS FILE IS AUTOGENERATED. DO NOT EDIT')
        lines.push('/* eslint-disable */')
        lines.push('/* tslint:disable */')

        let foundFiles = false
        _.forEach(files, (f) => {
          if (f.endsWith('index.ts') || f.endsWith('index.tsx')) {
            // Don't scan indexes
            return
          }
          if (f.endsWith('.d.ts')) {
            // Skip d.ts files
            return
          }
          if (f.indexOf('.spec.') !== -1 || f.indexOf('.test.') !== -1) {
            // Test files
            return
          }

          let basename = path.basename(f)
          let last = basename.lastIndexOf('.')
          let filename = basename.substring(0, last)

          foundFiles = true

          if (doesFileHaveNamedExport(f, filename)) {
            // Named exports
            lines.push(`export * from './${filename}'`)
          } else {
            // Group and re-export
            lines.push(`import * as ${filename} from './${filename}'`)
            lines.push(`export { ${filename} }`)
          }
        })

        if (!foundFiles) {
          // This is needed for CRA to compile (or we have to delete the index file)
          lines.push('export const noop = () => {}')
        }
        // Write the file
        fs.writeFileSync(path.join(_path, 'index.tsx'), lines.join('\n'))
        // Delete existing index.ts files
        // if (fs.existsSync(path.join(_path, 'index.ts'))) {
        //   fs.unlinkSync(path.join(_path, 'index.ts'))
        // }
      })
    })
  }
  const rebuildIndexesThrottled = _.debounce(rebuildIndexes, 250)

  function doesFileHaveNamedExport(_path, filename) {
    let regex = new RegExp(
      `\\s*export\\s+(async\s+)?(const|function|interface)\\s+(${filename})`,
    )
    let regex2 = new RegExp(`\\s*export\\s+{\\s+(${filename})\\s+.*}`)

    let f = fs.readFileSync(_path, { encoding: 'utf8' })
    return regex.test(f) || regex2.test(f)
  }

  _.forEach(options.src, (c) => {
    if (options.watch) {
      const watchDirectory = path.join(__dirname, c)
      rebuildIndex(watchDirectory)
      let watcher = watch([watchDirectory + '**/*.(ts|tsx)'], {
        ignoreInitial: false,
      })
      watcher.on('add', (_path: string, stat) => {
        rebuildIndex(_path)
      })
      watcher.on('change', (_path, stat) => {
        rebuildIndex(_path)
      })
      watcher.on('delete', (_path, stat) => {})
    } else {
      // TODO work without watch mode
      // glob(c + '/*.@(ts|tsx)')
    }
  })

  function _watch() {
    const app = express()
    app.use(cors())
    app.use(bodyParser.json())

    const port = options.port || 5000
    app.get('/', (req, res) => res.send('Barreler tool'))
    app.listen(port, () => console.log(`Barreler listening on port ${port}!`))
  }

  if (options.watch) {
    _watch()
  }
}
run()
