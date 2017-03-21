/// <reference path="../../node_modules/@types/jquery/index.d.ts" />
/// <reference path="./token.ts" />
/// <reference path="./util.ts" />
/// <reference path="./init.ts" />

let slack_sdk_path: string = '@slack/client';

let user_lists = new Array();
let channel_lists = new Array();
let bot_lists = new Array();
let emoji_lists = new Array();

let slack = require(slack_sdk_path);
let emojione = require("emojione");
let RtmClient = slack.RtmClient;
let RTM_EVENTS = slack.RTM_EVENTS;
let CLIENT_EVENTS = slack.CLIENT_EVENTS;
let WebClient = slack.WebClient;
let marked = require("marked");
let webs = new Array();
let rtms = new Array();

let mark_read_flag = (localStorage["mark_read_flag"] == "true");
let show_one_channel = false;

for(var i in tokens){
  rtms[i] = new RtmClient(tokens[i], {logLevel: 'debug'});
  rtms[i].start();
  webs[i] = new WebClient(tokens[i]);

  channel_lists[i] = {};
  init_channel_list(tokens[i], channel_lists[i]);


  user_lists[i] = {};
  init_user_list(tokens[i], user_lists[i]);
  emoji_lists[i] = {};
  init_emoji_list(tokens[i], emoji_lists[i]);

  // bot cannot be retrieved here
  bot_lists[i] = {};
}

for(var i in rtms){
  rtms[i].on(CLIENT_EVENTS.RTM.AUTHENTICATED, function (rtmStartData) {
    console.log(
    `Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}, but not yet    connected to a channel`
    );
  });
}

function delete_message(message: {}, team_name: string, ch_name: string): number {
  let pre_message: {} = message["previous_message"];
  let current_message: {} = message["message"];
  let tr_id: string = "#id_tr_" + pre_message["ts"].replace(".", "") + "_" + team_name + "_" + ch_name;
  let message_tr = $(tr_id);

  message_tr.remove();

  return 0;
}

function create_attachment_message(attachments: {}): string {
  let main_dom = $('<div></div>').addClass('div-attachment pull-left');

  // author
  let author_dom = $('<span></span>').addClass('attachment-author');
  if(attachments['author_icon']) author_dom.html('<img src="' + attachments['author_icon'] + '" />');
  if(attachments['author_link']) {
    let author_name_dom = $('<span></span>').addClass('attachment-author-name');
    if (attachments['author_link']) {
      author_name_dom = $('<a></a>').attr('href', attachments['author_link']).addClass('attachment-author-name');
    }
    author_name_dom.text(attachments['name']);
    author_dom.append(author_name_dom);
    main_dom.append(author_dom);
  }

  // title
  if(attachments['title']) {
    let title_dom = $('<b></b>').addClass('attachment-title');
    if(attachments['title_link']) {
      title_dom = $('<a></a>').attr('href', attachments['title_link']).attr('style', 'font-weight: bold;').addClass('attachment-title');
    }
    title_dom.text(attachments['title']);
    main_dom.append(title_dom);
  }

  // text
  if(attachments['text']) {
    main_dom.append(message_escape(attachments['text']));
  }

  // image
  if(attachments['image_url']) {
    let image_dom = $('<div style="width: 100%;"></div>').addClass('attachment-image');
    image_dom.html('<img src="' + attachments['image_url'] + '" width="100%" />');
    main_dom.append(image_dom);
  } else if (attachments['thumb_url']) {
    let thumb_dom = $('<div style="width: 20%;"></div>').addClass('pull-right');
    let width = 'width="100%"', height = "";
    thumb_dom.html('<img src="' + attachments['thumb_url'] + '" ' + width + ' ' + height + '/>');
    main_dom.attr('style', 'width: 75%;');
    return main_dom.prop('outerHTML') + thumb_dom.prop('outerHTML');
  }
  return main_dom.prop('outerHTML');
}

function update_message(message: {}, user_list: {}, emoji_list: {}): number {
  let pre_message: {} = message["previous_message"];
  let current_message: {} = message["message"];
  let message_id: string = "#id_" + pre_message["ts"].replace(".", "");
  let message_form = $(message_id);

  current_message["text"] += "<span style='font-size: small; color: #aaaaaa;'> (edited)</span>";
  let edited_message = message_escape(current_message["text"], user_list, emoji_list);
  if(current_message["attachments"]) {
    edited_message += create_attachment_message(current_message["attachments"][0]);
  }

  message_form.html(edited_message);
  return 0;
}

function mail_to_html(m: string): string {
  let message: string = m;
  message = message.replace(/<mailto:[^\|>]+\|([^\|>]+)>/g,  "<a href='mailto:$1'>$1</a>");
  return message;
}

function url_to_html(m: string): string {
  let message: string = m;
  message = message.replace(/<(http[^\|>]+)\|([^\|>]+)>/g,  "<a href='$1'>$2</a>");
  if(message == m)
    message = message.replace(/<(http[^>]+)>/g,  "<a href='$1'>$1</a>");
  return message;
}

function user_to_html(m: string, user_list: {}): string {
  let message: string = m;
  
  message = message.replace(/<@([^>]+)>/g, function (user) {
      let short_user: string = user.replace(/\|[^>]+/g, "");
      let name: string = "@" + user_list[short_user.substr(2, short_user.length - 3)].name;
      return name;
  });

  message = message.replace(/<!([^>]+)>/g, function(special) {
      let all: string = special.substr(2, special.length - 3);
      let bar: number = all.indexOf("|");
      let name: string = bar == -1 ? ("@" + all) : all.substr(bar + 1);
      return name;
  });

  return message;
}

function newline_to_html(m: string): string {
  let message: string = m.replace(/(\r\n|\n|\r)$/, "");
  message = message.replace(/\r\n|\n|\r/g, "<br>");
  return message;
}

function convert_emoji(m: string, emoji_list: {}): string {
  return m.replace(/:[a-zA-Z0-9_+\-]+:/g, function(emoji) {
      if (emoji != emojione.shortnameToImage(emoji)) {
        return emojione.shortnameToImage(emoji);
      } else if(!!emoji_list[emoji.substr(1, emoji.length-2)]) {
        let image_url = emoji_list[emoji.substr(1, emoji.length-2)];
        let html = '<img class="emojione" src="' + image_url + '" />';
        return html;
      } else {
        return emoji;
      }
  });
}

function message_escape(m: string, user_list: {}, emoji_list: {}): string {
  let message: string = m;
  message = url_to_html(message);
  message = mail_to_html(message);
  message = user_to_html(message, user_list);
  message = marked(message);
  message = newline_to_html(message);
  message = convert_emoji(message, emoji_list);

  return message;
}

function channel_mark (channel, timestamp, web) {
  web.channels.mark (channel, timestamp, function(err, info) {
    if(err) {
        console.log(err);
    }
  });
}

function extract_text(message: any, user_list: {}, emoji_list: {}): string {
  if(message["text"]) {
    return message_escape(message["text"], user_list, emoji_list);
  } else if(message["attachments"]) {
    let attachments: [any] = message["attachments"];
    return attachments.map (attachment => {
      let text = attachment["text"] ? message_escape(attachment["text"], user_list, emoji_list) : "";
      let pretext = attachment["pretext"] ? message_escape(attachment["pretext"], user_list, emoji_list) : "";
      return text + pretext;
    }).reduce((a, b) => a + b);    
  } else {
     return "";
  }
}

for(var i in rtms){
  let user_list:{} = user_lists[i];
  let channel_list:{} = channel_lists[i];
  let bot_list:{} = bot_lists[i];
  let emoji_list:{} = emoji_lists[i];
  let token: string = tokens[i]; 
  let web = webs[i];
  let team_info = {};

  rtms[i].on(RTM_EVENTS.MESSAGE, function (message) {
    let user: string = "";
    let image: string = "";
    let nick: string = "NoName";
    let channel: {} = channel_list[message["channel"]];
    let channel_name: string = channel ? channel["name"] : "DM";
    if(!team_info["team"])
      get_team_info(token, team_info);
    let team_name: string = team_info["team"]["name"];

    if(message["subtype"] == "message_deleted") {
      return delete_message(message, team_name, channel_name);
    } else if(message["subtype"] == "message_changed") {
      return update_message(message, user_list, emoji_list);
    } else if(message["subtype"] == "bot_message") {
      if(!message["bot_id"]) { // "Only visible to you" bot has no bot_id or user info
        image = ""
        nick = "slackbot"
      } else { // Normal bots
        if(!bot_list[message["bot_id"]])
          get_bot_info(message["bot_id"], token, bot_list);
        user = bot_list[message["bot_id"]];
        image = user["icons"]["image_36"];
        nick = message["username"];
      }
    } else {
      user = user_list[message["user"]];
      image = user["profile"]["image_32"];
      nick = user["name"];
    }
    let text: string = extract_text(message, user_list, emoji_list);
    let table = $("#main_table");
    let ts: string = message["ts"];

    let ts_date: Date = new Date(new Date(Number(ts)*1000));
    let ts_hour: string = ts_date.getHours().toString();
    ts_hour = Number(ts_hour) < 10 ? "0" + ts_hour : ts_hour;
    let ts_min: string = ts_date.getMinutes().toString();
    ts_min = Number(ts_min) < 10 ? "0" + ts_min : ts_min;
    let ts_s: string = ts_hour + ":" + ts_min;

    let color: string = channel ? channel["color"] : channel_color(nick);
    
    let link: string = "";
    if(channel_name == "DM"){
        link = "slack://user?team=" + team_info["team"]["id"] + "&id=" + message["user"];
    }else{
        link = "slack://channel?team=" + team_info["team"]["id"] + "&id=" + message["channel"];
    }

    let image_column: string = "<td><img src='" + image  + "' /></td>";
    let text_column: string = "<td><b>" + nick + " <a class='slack-link' href='" + link + "'><span style='color: " + color + "'>#" + channel_name + "</span></b></a> ";
    if(tokens.length > 1)
      text_column += "(" + team_name + ") ";
    text_column += "<span style='color: #aaaaaa; font-size: small;'>" + ts_s + "</span><br>";
    text_column += "<span id='id_" + ts.replace(".", "") + "' class='message'> "+ text + "</span></td>";

    let style: string = "";
    if(show_one_channel && (team_name != team_to_show || channel_name != ch_to_show))
      style = "display: none";
    let record: string = "<tr id='id_tr_" + ts.replace(".", "") + "_" + team_name + "_" + channel_name +
      "' style='" + style + "'>"+ image_column + text_column + "</tr>";
    table.prepend(record);

    if (mark_read_flag) {
      channel_mark(message["channel"], ts, web);
    }
  });
}
