module.exports = function(inputGrammar) {
	"use strict";
	var thisFileName = "abnf-for-sabnf-parser.js: ";
	var fs = require("fs");
	
	var apglib = require("apg-lib");
	var id = apglib.ids;
	var utils = apglib.utils;

	// 2.0.0 parser
	var syntaxOk = null;
	var syn = new (require("./syntax-callbacks.js"))();
	var sem = new (require("./semantic-callbacks.js"))();
	var errors = [];

	var sabnfGrammar = new (require("./abnf-for-sabnf-grammar.js"))();
	var parser = new apglib.parser();
	var trace = new apglib.trace();
	parser.ast = new apglib.ast();
	parser.stats = new apglib.stats();
	parser.callbacks = syn.callbacks;
	parser.ast.callbacks = sem.callbacks;

	this.errorsToString = function(title) {
		var str = "";
		if (typeof (title) === "string" || title !== "") {
			str += title + "\n";
		}
		errors.forEach(function(val, index) {
			str += "error: " + index + ": line: " + val.line + ": char: "
					+ val.char + ": msg: " + val.msg + "\n";
		});
		return str;
	}
	this.errorsToHtml = function(title) {
		return utils.errorsToHtml(inputGrammar.chars, inputGrammar.lines, errors, title);
	}

	var translateIndex = function(map, index){
		var ret = -1;
		if(index < map.length){
			for( var i = index; i < map.length; i += 1){
				if(map[i] !== null){
					ret = map[i];
					break;
				}
			}
		}
		return ret;
	}
	var reduceOpcodes = function(rules){
		// deleted unneeded ALT, CAT and REP ops
		rules.forEach(function(rule, ir){
			var opcodes = [];
			var map = [];
			var reducedIndex = 0;
			rule.opcodes.forEach(function(op, iop){
				if(op.type === id.ALT && op.children.length === 1){
					map.push(null);
				}else if(op.type === id.CAT && op.children.length === 1){
					map.push(null);
				}else if(op.type === id.REP && op.min === 1 && op.max === 1){
					map.push(null);
				}else{
					map.push(reducedIndex);
					opcodes.push(op);
					reducedIndex += 1;
				}
			});
			map.push(reducedIndex);

			// translate opcode indexes to reduced set
			opcodes.forEach(function(op, iop){
				if(op.type === id.ALT || op.type === id.CAT){
					for(var i = 0; i < op.children.length; i+= 1){
						op.children[i] = translateIndex(map, op.children[i]);
					}
				}
			});
			rule.opcodes = opcodes;
		});
		
	}

	this.syntax = function(strict, doTrace) {
		var ret = {
			hasErrors: false,
			state: null,
			stats: parser.stats,
			trace: null
		}
		if(strict !== true){
			strict = false;
		}
		if(doTrace !== true){
			doTrace = false;
		}else{
			doTrace = true;
			parser.trace = trace;
			ret.trace = trace;
		}

		// SYNTAX ANALYSIS
		// set up the syntax data
		var data = {};
		errors.length = 0;
		data.errors = errors;
		data.strict = strict;
		data.findLine = inputGrammar.findLine;
		data.ruleCount = 0;
		ret.state = parser.parse(sabnfGrammar, 'file', inputGrammar.chars, data);
		if(ret.state.success !== true){
			errors.push({
				line: 0,
				char: 0,
				msg: "syntax analysis of input grammar failed"
			});
		}
		if (errors.length === 0) {
			syntaxOk = true;
		}else{
			ret.hasErrors = true;
			syntaxOk = false;
		}
		return ret;
	}
	this.semantic = function() {
		var ret = {
				hasErrors: false,
			errors: errors,
			rules : null,
			udts : null
		}
		// SETUP
		while (true) {
			if (!syntaxOk) {
				errors.push({
					line : 0,
					char : 0,
					msg : "cannot do semantic analysis until syntax analysis has completed without errors"
				});
				ret.errors = errors;
				break;
			}
			var test;

			// SEMANTIC ANALYSIS
			var data = {};
			errors.length = 0;
			data.errors = errors;
			data.findLine = inputGrammar.findLine;
			parser.ast.translate(data);
			if(data.errors.length > 0){
				ret.hasErrors = true;
				break;
			}

			// SECOND-PASS, FINALIZATION OF OPCODES
			ret.rules = reduceOpcodes(data.rules);

			// success
			ret.rules = data.rules;
			ret.udts = data.udts;
			break;
		}
		return ret;
	}
	this.displayErrors = function() {
		return errorsToString(thisFileName + ": displayErrors()", errors);
	}
	this.displayErrorsHtml = function(className) {
		return errorsToHtml(thisFileName + ": displayErrors()", errors);
	}
	this.generateJavaScript = function(rules, udts, fileName){
		var i;
		var opcodeCount = 0;
		var charCodeMin = Infinity;
		var charCodeMax = 0;
		var ruleNames = [];
		var udtNames = [];
		var alt=0, cat=0, rnm=0, udt=0, rep=0, and=0, not=0, tls=0, tbs=0, trg=0;
		rules.forEach(function(rule){
			ruleNames.push(rule.lower);
			opcodeCount += rule.opcodes.length;
			rule.opcodes.forEach(function(op, iop){
				switch(op.type){
				case id.ALT:
					alt += 1;
					break;
				case id.CAT:
					cat += 1;
					break;
				case id.RNM:
					rnm += 1;
					break;
				case id.UDT:
					udt += 1;
					break;
				case id.REP:
					rep += 1;
					break;
				case id.AND:
					and += 1;
					break;
				case id.NOT:
					not += 1;
					break;
				case id.TLS:
					tls += 1;
					for(i = 0; i < op.string.length; i += 1){
						if(op.string[i] < charCodeMin){
							charCodeMin = op.string[i]; 
						}
						if(op.string[i] > charCodeMax){
							charCodeMax =op.string[i]; 
						}
					}
					break;
				case id.TBS:
					tbs += 1;
					for(i = 0; i < op.string.length; i += 1){
						if(op.string[i] < charCodeMin){
							charCodeMin =op.string[i]; 
						}
						if(op.string[i] > charCodeMax){
							charCodeMax =op.string[i]; 
						}
					}
					break;
				case id.TRG:
					trg += 1;
					if(op.min < charCodeMin){
						charCodeMin =op.min; 
					}
					if(op.max > charCodeMax){
						charCodeMax =op.max; 
					}
					break;
				}
			});
		});
		ruleNames.sort();
		if(udts.length > 0){
			udts.forEach(function(udt){
				udtNames.push(udt.lower);
			});
			udtNames.sort();
		}
		
		// open 
		fileName += ".js";
		try{
			var fd = fs.openSync(fileName, "w");
			fs.writeSync(fd, "module.exports = function(){\n");
			fs.writeSync(fd, "\"use strict\";\n");
			fs.writeSync(fd, "\n");
			fs.writeSync(fd, "    // SUMMARY\n");
			fs.writeSync(fd, "    //      rules = "+rules.length+"\n");
			fs.writeSync(fd, "    //       udts = "+udts.length+"\n");
			fs.writeSync(fd, "    //    opcodes = "+opcodeCount+"\n");
			fs.writeSync(fd, "    //        ALT = "+alt+"\n");
			fs.writeSync(fd, "    //        CAT = "+cat+"\n");
			fs.writeSync(fd, "    //        RNM = "+rnm+"\n");
			fs.writeSync(fd, "    //        UDT = "+udt+"\n");
			fs.writeSync(fd, "    //        REP = "+rep+"\n");
			fs.writeSync(fd, "    //        AND = "+and+"\n");
			fs.writeSync(fd, "    //        NOT = "+not+"\n");
			fs.writeSync(fd, "    //        TLS = "+tls+"\n");
			fs.writeSync(fd, "    //        TBS = "+tbs+"\n");
			fs.writeSync(fd, "    //        TRG = "+trg+"\n");
			fs.writeSync(fd, "    // characters = [");
			if((tls + tbs + trg) === 0){
				fs.writeSync(fd, " none defined ]");
			}else{
				fs.writeSync(fd, charCodeMin+" - "+charCodeMax+"]");
			}
			if(udt > 0){
				fs.writeSync(fd, " + user defined");
			}
			fs.writeSync(fd, "\n");
			fs.writeSync(fd, "\n");
			fs.writeSync(fd, "    // CALLBACK LIST PROTOTYPE (true, false or function reference)\n");
			fs.writeSync(fd, "    this.callbacks = [];\n");
			ruleNames.forEach(function(name){
				fs.writeSync(fd, "    this.callbacks['"+name+"'] = false;\n");
			});
			if(udts.length > 0){
				udtNames.forEach(function(name){
					fs.writeSync(fd, "    this.callbacks['"+name+"'] = false;\n");
				});
			}
			fs.writeSync(fd, "\n");
			fs.writeSync(fd, "    // OBJECT IDENTIFIER (for internal parser use)\n");
			fs.writeSync(fd, "    this.grammarObject = 'grammarObject';\n");
			fs.writeSync(fd, "\n");
			fs.writeSync(fd, "    // RULES\n");
			fs.writeSync(fd, "    this.rules = [];\n");
			rules.forEach(function(rule, i){
				fs.writeSync(fd, "    this.rules["+i+"] = {name: '"+rule.name+"', lower: '"+rule.lower+"', index: "+rule.index+"};\n");
			});
			fs.writeSync(fd, "\n");
			fs.writeSync(fd, "    // UDTS\n");
			fs.writeSync(fd, "    this.udts = [];\n");
			if(udts.length > 0){
				udts.forEach(function(udt, i){
					fs.writeSync(fd, "    this.udts["+i+"] = {name: '"+udt.name+"', lower: '"+udt.lower+"', empty: "+udt.empty+", index: "+udt.index+"};\n");
				});
			}
			fs.writeSync(fd, "\n");
			fs.writeSync(fd, "    // OPCODES\n");
			rules.forEach(function(rule, ruleIndex){
				if(ruleIndex > 0){
					fs.writeSync(fd, "\n");
				}
				fs.writeSync(fd, "    // "+rule.name+"\n");
				fs.writeSync(fd, "    this.rules["+ruleIndex+"].opcodes = [];\n");
				rule.opcodes.forEach(function(op, opIndex){
					switch(op.type){
					case id.ALT:
						fs.writeSync(fd, "    this.rules["+ruleIndex+"].opcodes["+opIndex+"] = {type: "+op.type+", children: ["+op.children.toString()+"]};// ALT\n");
						break;
					case id.CAT:
						fs.writeSync(fd, "    this.rules["+ruleIndex+"].opcodes["+opIndex+"] = {type: "+op.type+", children: ["+op.children.toString()+"]};// CAT\n");
						break;
					case id.RNM:
						fs.writeSync(fd, "    this.rules["+ruleIndex+"].opcodes["+opIndex+"] = {type: "+op.type+", index: "+op.index+"};// RNM("+rules[op.index].name+")\n");
						break;
					case id.UDT:
						fs.writeSync(fd, "    this.rules["+ruleIndex+"].opcodes["+opIndex+"] = {type: "+op.type+", empty: "+op.empty+", index: "+op.index+"};// UDT("+udts[op.index].name+")\n");
						break;
					case id.REP:
						fs.writeSync(fd, "    this.rules["+ruleIndex+"].opcodes["+opIndex+"] = {type: "+op.type+", min: "+op.min+", max: "+op.max+"};// REP\n");
						break;
					case id.AND:
						fs.writeSync(fd, "    this.rules["+ruleIndex+"].opcodes["+opIndex+"] = {type: "+op.type+"};// AND\n");
						break;
					case id.NOT:
						fs.writeSync(fd, "    this.rules["+ruleIndex+"].opcodes["+opIndex+"] = {type: "+op.type+"};// NOT\n");
						break;
					case id.TLS:
						fs.writeSync(fd, "    this.rules["+ruleIndex+"].opcodes["+opIndex+"] = {type: "+op.type+", string: ["+op.string.toString()+"]};// TLS\n");
						break;
					case id.TBS:
						fs.writeSync(fd, "    this.rules["+ruleIndex+"].opcodes["+opIndex+"] = {type: "+op.type+", string: ["+op.string.toString()+"]};// TBS\n");
						break;
					case id.TRG:
						fs.writeSync(fd, "    this.rules["+ruleIndex+"].opcodes["+opIndex+"] = {type: "+op.type+", min: "+op.min+", max: "+op.max+"};// TRG\n");
						break;
					}
				});
			});
			
			fs.writeSync(fd, "}\n");
			
			// display the grammar that produced these opcodes
			var str;
			fs.writeSync(fd, "\n"); 
			fs.writeSync(fd, "// INPUT GRAMMAR FILE(s)\n");
			fs.writeSync(fd, "//\n"); 
			inputGrammar.lines.forEach(function(line, index){
				var end = line.beginChar + line.textLength;
				str = "";
				for(var i = line.beginChar; i < end; i += 1){
					str += String.fromCharCode(inputGrammar.chars[i]);
				}
				fs.writeSync(fd, "// "+str+"\n");
			});
			
			fs.close(fd);
		}catch(e){
			throw new Error(thisFileName+"generateJavaScript(): file system error\n"+e.message);
		}
		return fileName;
	}
}