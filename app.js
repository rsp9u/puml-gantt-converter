/*
 * Gantt format Converter
 */
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

function extractTasksOrMilestones(identity, ganttstr) {
  let r = [];
  let rm = [];
  let b = false;
  for (var line of ganttstr.split("\n")) {
    if (line === `-- ${identity} --`) {
      b = true;
    } else if (b === true && line.startsWith("--")) {
      b = false;
      rm.push(line);
    } else if (b === true) {
      var sp = line.split(/\s+/);
      if (sp.length === 3 && sp[1] === "as") {
        r.push({text: sp[0], alias: sp[2]});
      }
    } else {
      rm.push(line);
    }
  }
  return {
    list: r,
    removed: rm.join("\n"),
  }
}

function joinChildren(ganttstr) {
  var ret = [];
  var prev = "";
  var b = false;
  for (var line of ganttstr.split("\n")) {
    if (line.startsWith(" ")) {
      if (b === false) {
        ret = ret.slice(0, -1);
        b = true;
      }
      ret.push([prev, line.trim()].join(" "));
    } else {
      ret.push(line);
      b = false;
      prev = line;
    }
  }
  return ret.join("\n");
}

function replaceVerbs(ganttstr) {
  var ret = [];
  for (var line of ganttstr.split("\n")) {
    var col = line.split(/\s+/);
    if (col.length < 2) {
      continue;
    }
    if (col[1].startsWith(".")) {
      col[0] = col[0].slice(0, -1) + " ]";
      let colored = col[0] + " is colored in Violet/DarkViolet";
      if (!ret.includes(colored)) {
        ret.push(colored);
      }
    }
    if (col[1].startsWith(">")) {
      let colored = col[0] + " is colored in GreenYellow/Green";
      if (!ret.includes(colored)) {
        ret.push(colored);
      }
    }
    if (col[1].startsWith(">=") || col[1].startsWith(">>") || col[1].startsWith("><") ||
        col[1].startsWith(".=") || col[1].startsWith(".>") || col[1].startsWith(".<")) {
      if (line.includes("@")) {
        var i = 0;
        for (var c of col) {
          if (c.startsWith("@")) {
            col[0] += ` on {${c.slice(1)}}`;
            break;
          }
          i += 1;
        }
        col.splice(i, 1);
      }
    }
    if (col[1].match(/[>.]!/)) {
      let s = [col[0], "happens at"];
      Array.prototype.push.apply(s, col.slice(2));
      ret.push(s.join(" "));
    } else if (col[1].match(/[>.]=/)) {
      let s = [col[0], "lasts"];
      Array.prototype.push.apply(s, col.slice(2));
      ret.push(s.join(" "));
    } else if (col[1].match(/[>.]>/)) {
      let s = [col[0], "starts at"];
      Array.prototype.push.apply(s, col.slice(2));
      ret.push(s.join(" "));
    } else if (col[1].match(/[>.]</)) {
      let s = [col[0], "ends at"];
      Array.prototype.push.apply(s, col.slice(2));
      ret.push(s.join(" "));
    } else {
      ret.push(line);
    }
  }
  return ret.join("\n");
}

function convertGantt(plantstr) {
  var tasks = extractTasksOrMilestones("tasks", plantstr);
  var milestones = extractTasksOrMilestones("milestones", tasks.removed);
  var newC = milestones.removed;

  // replace aliases
  for (var task of tasks.list) {
    let regex = new RegExp(task.alias, "g");
    newC = newC.replace(regex, task.text);
  }
  for (var milestone of milestones.list) {
    let regex = new RegExp(milestone.alias, "g");
    newC = newC.replace(regex, milestone.text);
  }

  newC = joinChildren(newC);
  newC = replaceVerbs(newC);
  return newC;
}

/*
 * http server
 */
const request = require('request');
const plantumlEncoder = require('plantuml-encoder');

const Koa = require('koa');
const Router = require('koa-router');
const Parameter = require('koa-parameter');
const CORS = require('@koa/cors');

const app = new Koa();
const router = Router();
const cors = CORS({origin: '*'});

app.use(cors)
Parameter(app)

function convertRoute(ctx, filetype) {
  console.log("[INFO] received a request");

  const plantstr = ctx.params['plantstr'];
  //console.log(`plant encoded str is following; "${plantstr}`)

  try {
    var plain = plantumlEncoder.decode(plantstr);
    //console.log(`plant plain str is following; "${plain}`)
  } catch (err) {
    console.log("[ERROR] failed to decode given string from url");
    return;
  }

  if (plain.matchAll(/^project starts/)) {
    plain = convertGantt(plain);
  }

  const encoded = plantumlEncoder.encode(plain);

  const plantServer = process.env.PGC_PLANTUML_SERVER;
  return request(`${plantServer}/${filetype}/${encoded}`);
}

router.get('/svg/:plantstr', ctx => {
  ctx.body = ctx.req.pipe(convertRoute(ctx, 'svg'));
  ctx.set('Content-Type', 'image/svg+xml');
});

router.get('/png/:plantstr', ctx => {
  ctx.body = ctx.req.pipe(convertRoute(ctx, 'png'));
  ctx.set('Content-Type', 'image/png');
});

router.get('/uml/:plantstr', ctx => {
  ctx.body = ctx.req.pipe(convertRoute(ctx, 'uml'));
  ctx.set('Content-Type', 'text/html; charset=UTF-8');
});

app.use(router.routes());
app.use(router.allowedMethods());

function errorExit(msg) {
  console.log(msg);
  process.exit(1);
}

if (process.env.PGC_PORT === undefined) { errorExit("set PGC_PORT"); }
if (process.env.PGC_PLANTUML_SERVER === undefined) { errorExit("set PGC_PLANTUML_SERVER"); }

app.listen(parseInt(process.env.PGC_PORT));
