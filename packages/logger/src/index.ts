import chalk from 'chalk';
import colorize from 'json-colorizer';
import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, prettyPrint } = format;

const getContrastColour = (colour: string) => {
  const r = parseInt(colour.substring(0, 2), 16);
  const g = parseInt(colour.substring(2, 2), 16);
  const b = parseInt(colour.substring(4, 2), 16);
  const uicolors = [r / 255, g / 255, b / 255];
  const c = uicolors.map((col) => {
    if (col <= 0.03928) {
      return col / 12.92;
    }
    return ((col + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return L > 0.179 ? '000000' : 'ffffff';
};

const stringToColour = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let colour = '';
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-bitwise
    const value = (hash >> (i * 8)) & 0xff;
    colour += `00${value.toString(16)}`.substr(-2);
  }
  return colour;
};

const developmentFormat = printf((info) => {
  const { level: logLevel, timestamp: ts, module, handler, method, ...other } = info;
  const leftItems = [] as { output: string; bgHex: string }[];
  switch (logLevel) {
    case 'error':
      leftItems.push({
        output: chalk.hex(getContrastColour('e88388')).bgHex('e88388').bold(` ❌ ${logLevel} `),
        bgHex: 'e88388',
      });
      break;
    case 'warn':
      leftItems.push({
        output: chalk.hex(getContrastColour('dbab79')).bgHex('dbab79').bold(` ⚠️ ${logLevel} `),
        bgHex: 'dbab79',
      });
      break;
    case 'info':
      leftItems.push({
        output: chalk.hex(getContrastColour('66c2cd')).bgHex('66c2cd').bold(` ℹ️ ${logLevel} `),
        bgHex: '66c2cd',
      });
      break;
    case 'debug':
      leftItems.push({
        output: chalk.hex(getContrastColour('a8cc8c')).bgHex('a8cc8c').bold(` 🍆 ${logLevel} `),
        bgHex: 'a8cc8c',
      });
      break;
    default:
      leftItems.push({
        output: chalk.hex(getContrastColour('b9bfca')).bgHex('b9bfca').bold(` ❓ ${logLevel} `),
        bgHex: 'b9bfca',
      });
  }
  if (module) {
    const bgHex = stringToColour(module);
    leftItems.push({
      output: chalk.hex(getContrastColour(bgHex)).bgHex(bgHex).bold(` ${module} `),
      bgHex,
    });
  }
  if (handler) {
    const bgHex = stringToColour(handler);
    leftItems.push({
      output: chalk.hex(getContrastColour(bgHex)).bgHex(bgHex).bold(` ${handler} `),
      bgHex,
    });
  }
  if (method) {
    const bgHex = stringToColour(method);
    leftItems.push({
      output: chalk.hex(getContrastColour(bgHex)).bgHex(bgHex).bold(` ${method} `),
      bgHex,
    });
  }
  let title = '';
  for (let i = 0; i < leftItems.length; i += 1) {
    let arrow = chalk
      .hex(leftItems[i].bgHex)
      .bgHex(leftItems[i + 1]?.bgHex ?? '000000')
      .bold('');
    if (!leftItems[i + 1]) arrow = chalk.hex(leftItems[i].bgHex).bold('');
    title += `${leftItems[i].output}${arrow}`;
  }
  return `${title} ╞ ${ts} ╡ \n${colorize(Object(other), { pretty: true })}\n`;
});

const generateFormat = (customformatter?: ReturnType<typeof printf>) =>
  combine(
    ...[
      timestamp(),
      ...(customformatter ? [customformatter] : []),
      ...(process.env.NODE_ENV === 'development'
        ? [developmentFormat]
        : [prettyPrint(), format.json()]),
    ],
  );

const logger = createLogger({
  format: generateFormat(),
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'warn'),
  transports: [
    new transports.Console({
      handleExceptions: true,
    }),
  ],
  exitOnError: false,
});

export const simpleFormatter = (
  templateFunction: (
    info: { timestamp: string } & Parameters<Parameters<typeof printf>[0]>[0],
  ) => ReturnType<Parameters<typeof printf>[0]>,
) => printf(templateFunction as Parameters<typeof printf>[0]);

export const injectFormatter = (formatter: ReturnType<typeof printf>) => {
  logger.format = generateFormat(formatter);
};

export default logger;
