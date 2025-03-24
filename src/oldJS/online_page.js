$.noConflict()
var jq14 = jQuery.noConflict(true);

vers = '1.1.00'
active_fs_report_line = {}
shower_caller_id = ''
b_totalSeconds = 0
monitor_projects = {}
all_projects = {}
monitor_callcenter = {}
monitor_users = {}
out_extensions = {}
get_out_start = false
active_call_id = ''
out_active_phone = {}
out_active_project_name = ''
out_active_start_type = ''
out_active_start = ''
out_active_taken_reason = ''
assigned_key = ''
out_base_fields = {}
script_dir = 'inbound'
active_call_filled = false
active_direction = ''
script_id = false
block_count = 0
script_mode = 'rememeber' //rememeber/forget
comment_mode = 'false'
script_source = 'ab'
break_status = false
break_reason = false
block_before = false
api_call_active = false
call_initiation = false
out_preparation = false

got_callcenter_queues = false


question_stats = {}
question_search = {}
cat_search = {}

var projects = {}
var logout = false
var fs_report_dict = {}
var fs_reasons = {}
var fs_results = {}
as_is_dict = {}
as_is_filled = {}

active_uuid = ''
active_uuid_post = false
var dia_dest = undefined
active_caller_id = ''
active_datetime_start = ''
interval_id = undefined
postobrabotka_id = undefined
postobrabotka_stop = undefined;
post_stop = 5
level = 1
total_levels = 1
onpage = 10
call_to_show = undefined
refreshSeconds = 0
tot_dir = ''

statuses = {}
status_main_check = false
fs_monitor_dict = {}
active_modules_dict = {}
active_modules = []
statuses_vis_s = false

let username = "pmstore";
let password = "glagol_the_best";

vizov_btn = 'call'

fs_state = ''
fs_status = ''
sofia = ''
back_on_line = 0


let xhr = new XMLHttpRequest();

call_section_dict = {1:false,2:false,3:false,}
active_section_dict = {1:false,2:false,3:false,}
post_call_section_dict = {1:false,2:false,3:false,}
active_call_section_dict = {
1:{'active_datetime_start':'',
'active_caller_id':''},
2:{'active_datetime_start':'',
'active_caller_id':''},
3:{'active_datetime_start':'',
'active_caller_id':''}
}
call_secs = [1, 2, 3]
for (cc_id in call_secs){
    ccc = call_secs[cc_id]
    active_call_section_dict[ccc] = {'active_direction': '',
    'uuid': '',
    'b_uuid': '',
    'active_caller_id': '',
    'active_datetime_start': '',
    'active_caller_id': '',
    'active_datetime_start': '',
    'datetime_start': '',
    'datetime_end': '',
    }
}




interval_id_dict = {1:undefined,2:undefined,3:undefined}

modules_after = []
modules_before = []
call_shower_finished = false
after_finish = 0

function makeid(length) {
    var result           = [];
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result.push(characters.charAt(Math.floor(Math.random() *
 charactersLength)));
   }
   return result.join('');
}

room_id = makeid(40);


//alert('ho');
function getCookie(cname) {
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for(var i = 0; i <ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0) {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

session_key = getCookie("session_key");
sip_login = getCookie("sip_login");
fs_server = getCookie("fs_server");
out_extension = getCookie("out_extension");

s_dot = login.indexOf('.')
s_login = login.slice(s_dot+1)

if (session_key != session_check){
    //console.log(session_key, session_check)
    window.location.href = "/login_work/";
}
function setCookie(name,value,days) {
    var expires = "";
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days*24*60*60*1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "")  + expires + "; path=/";
}


function make_selectize(sel_place, s_id, set_val, def_text, def_val, sel_list, create, onchange, create_place_holder, width, margin_top){
    s_name = list_combiner(s_id)
    d_id = ['place']
    for (ii in s_id){
        d_id.push(s_id[ii])
    }
    div_p = make_html('div', d_id, {}, '', sel_place);
    sel_dict = {'style':'width:'+width+'; margin-top:'+margin_top+';'}
    if (onchange != false){
        sel_dict['onchange'] = onchange
        sel_dict['oninput'] = onchange
        sel_dict['onclick'] = onchange
    }
    ret = make_html('select', s_id, sel_dict, '', div_p[1]);
    d_lines = []
    make_html('option', [], {'value':def_val}, def_text, ret[1]);
    for (s in sel_list){
            vall = sel_list[s]
            make_html('option', [], {'value':vall}, vall, ret[1]);
    }

     $(function () {

            d_id = '#'+s_name
            var $select = $(d_id).selectize(
                {create: create,
                sortField: "text",
                placeholder:create_place_holder});
            var active_selectize = $select[0].selectize; // This stores the selectize object to a variable (with name 'selectize')
            if (set_val != undefined){
                active_selectize.setValue(set_val, false)
            }
     }(jq14))
     return div_p
}



function make_html(h_type, id_list, params_dict, text, parent_id){

        var div = document.createElement(h_type);
        var div_id = '';
        if (id_list.length > 0){
            div_id = list_combiner(id_list);
            div.id = div_id
        }

        if (Object.keys(params_dict).length > 0){
            for (i in params_dict){
                div.setAttribute(i, params_dict[i]);
            }
        }
        if (text != ''){
            div.textContent = text;
        }

        document.getElementById(parent_id).appendChild(div);
        return [div, div_id];

}

function make_html_before(h_type, id_list, params_dict, text, parent_id, before){

        var div = document.createElement(h_type);
        var div_id = '';
        if (id_list.length > 0){
            div_id = list_combiner(id_list);
            div.id = div_id
        }

        if (Object.keys(params_dict).length > 0){
            for (i in params_dict){
                div.setAttribute(i, params_dict[i]);
            }
        }
        if (text != ''){
            div.textContent = text;
        }

        document.getElementById(parent_id).insertBefore(div, before);
        return [div, div_id];

}


function function_combiner(function_name, f_list){

    var f_name = function_name;
    f_name += "(";
    if (f_list.length == 0){
         f_name += ")";
    } else {
        for (i in f_list){
            f_name += "'";
            f_name += f_list[i];
            f_name += "'";
            var i_plus = parseInt(i)+1;
            if (i_plus<f_list.length){
                f_name += ", ";
            } else {
                f_name += ")";
            }
        }
    }
    return f_name;
}

function list_combiner(id_list){

    var div_id = '';
    for (i in id_list){
        div_id += id_list[i];
        var i_plus = parseInt(i)+1;
        if (i_plus<id_list.length){
            div_id += "_";
        }

    }
    return div_id;
}


var protocol = window.location.protocol;

var socket_click = io("wss://worker.glagol.ai",
{transports: ['websocket']}
)

socket_click.on('connect', function () {
});



function logout_fs(fs_server){
    sip_login = fs_sip_logins[fs_server]
    socket_click.emit('change_stat_fs', {'fs_server':fs_server, 'sip_login':sip_login, 'room_id':room_id, 'worker':login, 'session_key':session_key, 'action':'logout'})
}

function start_fs(fs_server){
    sip_login = fs_sip_logins[fs_server]
    socket_click.emit('change_stat_fs', {'fs_server':fs_server, 'sip_login':sip_login, 'room_id':room_id, 'worker':login, 'session_key':session_key, 'action':'available'})
    setCookie('fs_server',fs_server,30)
    window.location.href = "/operator_online/";
}

//console.log('-!-!-!-')
socket_click.emit('get_fs_report', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'level':(level-1)*onpage})

function show_fs_report(fs_report){
    fs_report_dict = {}

    filled = false
    non_filled = false
    var myNode = document.getElementById("calls_to_fill");
      while (myNode.firstChild) {
        myNode.removeChild(myNode.lastChild);
      }
    var myNode = document.getElementById("calls_filled");
      while (myNode.firstChild) {
        myNode.removeChild(myNode.lastChild);
      }
    for (fs_c in fs_report){
        fs_report_line = fs_report[fs_c]



       if ((fs_report_line['call_reason'] == null) && (fs_report_line['call_result']==null) && (fs_report_line['oper_saved']!=true)){
            if (non_filled == false){
                non_filled = true
                  document.getElementById("calls_to_fill").className = "row col-12 pb-4 pt-2";
                  document.getElementById("calls_to_fill_card").className = "card col-12 ml-3 mr-4 pt-2 pb-4 mb-2";
            }
        } else {
            if (filled == false){

                filled = true
                  document.getElementById("calls_filled").className = "row col-12 pb-4 pt-2";
                  document.getElementById("calls_filled_card").className = "card col-12 ml-3 mr-4 pt-2 pb-4 mb-2";
            }
        }
    }
     if (non_filled == false){
        make_html('p', [], {'class':'font-weight-bold mb-2 mt-3'}, 'У вас пока нет вызовов в незаполненном статусе.',"calls_to_fill");

     }
    if (filled == false){
        make_html('p', [], {'class':'font-weight-bold mb-2 mt-3'}, 'У вас пока нет вызовов в незаполненном статусе.',"calls_filled");
    }


    for (fs_c in fs_report){

        fs_report_line = fs_report[fs_c]
        call_filled = false
        if ((fs_report_line['call_reason'] == null) && (fs_report_line['call_result']==null) && (fs_report_line['oper_saved']!=true)){
            call_line = "calls_to_fill"
            butt_text = 'Заполнить'
            butt_color = 'danger'
        } else {
            call_line = "calls_filled"
            butt_text = 'Редактировать'
            butt_color = 'info'
            call_filled = true
        }
        fs_id = fs_report_line['id']
        fs_report_dict[fs_id] = fs_report_line

        var return_list = make_html('div', ['call', fs_id], {'class':'row col-12 border border-'+butt_color+' rounded my-1 ml-2', 'onclick':'show_call_edit('+fs_id+', '+call_filled+', true)', 'style':'height:55px;'}, '', call_line);
        call_id = return_list[1]
        //console.log('-------______--------')
        //console.log(call_id)
        //console.log(fs_report_line['caller_id'])
        //console.log(document.getElementById(call_id))

        if (fs_report_line['a_line_num'] ==  sip_login){
            tot_dir = 'outbound'
        } else if (fs_report_line['b_line_num'] ==  sip_login){
            tot_dir = 'inbound'
        }

        if (tot_dir != 'outbound'){
            var return_list = make_html('i', [], {'class':"fas fa-fw fa-sign-in-alt mb-2  mr-1", 'style':'color: #28a745; margin-top: 16px;', 'title':'Входяящий вызов'}, '', call_id);
            var return_list = make_html('p', ['phone', fs_id], {'class':'font-weight-bold mb-2 mt-3','style':'font-size:13px;'}, fs_report_line['caller_id'], call_id);
        } else {
            var return_list = make_html('i', [], {'class':"fas fa-fw fa-sign-out-alt mb-2  mr-1", 'style':'color: #dc3545; margin-top: 16px;', 'title':'Исходящий вызов'}, '', call_id);
            var return_list = make_html('p', ['phone', fs_id], {'class':'font-weight-bold mb-2 mt-3', 'style':'font-size:13px;'}, fs_report_line['destination_id'], call_id);
        }

        var return_list = make_html('p', ['sep', fs_id], {'class':'ml-2 mb-2 mt-3','style':'font-size:13px;'}, '||', call_id);
        var return_list = make_html('p', ['dt', fs_id], {'class':'ml-2 mb-2 mt-3', 'style':'font-size:13px;'}, fs_report_line['datetime_start'], call_id);
        var return_list = make_html('p', ['sep_2', fs_id], {'class':'ml-2 mb-2 mt-3', 'style':'font-size:13px;'}, '||', call_id);
        time = fs_report_line['len_time']
        var minutes = Math.floor(time / 60);
        var seconds = time - minutes * 60;
        len_time = 'Продолжительность '
        if (minutes > 0){
            len_time += minutes + ' мин.'
        }
        len_time += Math.round(seconds) + ' сек.'
        var return_list = make_html('p', ['dt', fs_id], {'class':'ml-2 mb-2 mt-3', 'style':'font-size:13px;'}, len_time, call_id);
        var return_list = make_html('div', ['fill', fs_id], {'class':'col'}, '', call_id);
        //var return_list = make_html('button', ['call', fs_id], {'class':'btn btn-outline-light my-1 ml-2 py-1', }, butt_text, call_id);

    }
    var return_list = make_html('div', ['fill_stop'], {'class':'row col-12'}, '', "calls_filled");
    var return_list = make_html('div', ['to_fill_stop'], {'class':'row col-12'}, '', "calls_to_fill");
    //console.log(call_to_show)
    if (call_to_show != undefined){
        show_call_edit(call_to_show, false, false)
        call_to_show = undefined
    }

}

function make_audio(project_name, datetime_start, a_line_num, special_key_call, call_id, total_direction, audio_part_2, audio_sect){
        //console.log(special_key_call)
        var myNode = document.getElementById(audio_sect);
          while (myNode.firstChild) {
            myNode.removeChild(myNode.lastChild);
          }

        //audio_link = 'https://records.698155-cw63046.tmweb.ru/'
        audio_link = 'https://my.glagol.ai/get_cc_audio/'
        folder = project_name
        if (folder != undefined){
            folder = folder.replace('@', '_at_')
        }
        audio_link += folder +'/'
        //if (audio_part_2 == ''){

        //    dt_to_clear = datetime_start
        //    while (dt_to_clear.includes(' ')){
        //        dt_to_clear = dt_to_clear.replace(' ', '-')
        //   }
        //    while (dt_to_clear.includes(':')){
        //        dt_to_clear = dt_to_clear.replace(':', '-')
        //    }
            //if (total_direction != 'outbound'){
            //    audio_link += dt_to_clear+'.'+a_line_num+'.'+caller_id+'.'+special_key_call+'.mp3'
            //} else {
            //    audio_link += dt_to_clear+'.'+caller_id+'.'+a_line_num+'.'+special_key_call+'.mp3'
            //}
        //} else {
            audio_link += audio_part_2
        //}
        if (audio_part_2 != ''){
        var return_list = make_html('audio', ['cs', 'ac', call_id], {'controls':""}, '', audio_sect);
        var return_list = make_html('source', ['cs', 'as', call_id], {'src':audio_link, 'type':"audio/mpeg"}, '', return_list[1]);
        }
}

function show_call_edit(call_id, call_filled, script_show){
    //active_uuid = ''
    active_call_filled = call_filled
    call_section_dict = {1:false,2:false,3:false,}

    fs_report_line = fs_report_dict[call_id]
    //console.log('____show_____')
    //console.log(call_id)
    //console.log(fs_report_dict[call_id])


    datetime_start = fs_report_line['datetime_start']
    project_name = fs_report_line['project_name']

    l_dir = 'inbound'
    if ((fs_report_line['a_line_num'] ==  sip_login) || (project_name.includes(' (outbound)'))){
       l_dir = 'outbound'
    } else if (fs_report_line['b_line_num'] ==  sip_login){
        l_dir = 'inbound'
    }

    if (l_dir != 'outbound'){
        caller_id = fs_report_line['caller_id']
    } else {
        caller_id = fs_report_line['destination_id']
    }
    //console.log(call_filled, script_show)
    modules_before = []
    modules_after = []
    if (call_filled == false) {
        //console.log('project_name', project_name)
        if (script_show == true){
            script_shower(project_name)
        }
        module_shower(project_name)
    }

    if (l_dir != 'outbound'){
        a_line_num = fs_report_line['a_line_num']
    } else {
        a_line_num = fs_report_line['caller_id']
    }
    special_key_call = fs_report_line['special_key_call']
    call_reason = fs_report_line['call_reason']
    call_result = fs_report_line['call_result']
    user_comment = fs_report_line['user_comment']
    base_fields = fs_report_line['base_fields']

    //console.log(l_dir)
    call_shower(call_id, caller_id, datetime_start, project_name, a_line_num, special_key_call, call_reason, call_result, user_comment, l_dir, fs_report_line['record_name'], 1, base_fields)
   }

function script_shower(project_name){
    //console.log('project_name', project_name)
    if (out_active_project_name == ''){
        script_dir = active_call_section_dict[1]['active_direction']
        if ((script_dir == '') || (script_dir == undefined)){
           if (project_name.includes(' (outbound)')){
                script_dir = 'outbound'
           } else {
                script_dir = 'inbound'
           }
        }
    } else {
        script_dir = 'outbound'
    }
    //console.log('script_dir', script_dir)
    if (project_name.includes(' (outbound)')){
        project_name = project_name.replace(' (outbound)', '@default')
    }
    console.log(project_name, script_dir)
        socket_click.emit('script_operations', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'action':'start_script',
            'direction':script_dir, 'uuid':active_call_section_dict[1]['uuid'], 'b_uuid':active_call_section_dict[1]['b_uuid'], 'project_name':project_name})
}

function module_shower(project_name){

    active_modules = []
    socket_click.emit('module_operations', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'action':'get_modules',
           'project_name':project_name})
}

function back(project_name){

        $('#report_place').fadeIn().show();
        $('#script_place').fadeOut(300);

}



function call_shower(call_id, caller_id, datetime_start, project_name, a_line_num, special_key_call, call_reason, call_result, user_comment, total_direction, audio_part_2, call_section, base_fields){

    shower_caller_id = caller_id
    if (out_active_project_name != ''){
        project_name = out_active_project_name
    }
    if (project_name.includes(' (outbound)')){
        project_name = project_name.replace(' (outbound)', '@default')
    }

    call_shower_finished = false

    hash_call_section = '#call_section_'+call_section
    $(hash_call_section).fadeIn().show();

    header_sect = 'header_sect_'+call_section
    body_sect = 'body_sect_'+call_section
    audio_sect = 'audio_sect_'+call_section


    //console.log(header_sect)
    var myNode = document.getElementById(header_sect);
      while (myNode.firstChild) {
        myNode.removeChild(myNode.lastChild);
      }
    var myNode = document.getElementById(body_sect);
      while (myNode.firstChild) {
        myNode.removeChild(myNode.lastChild);
      }
    var myNode = document.getElementById(audio_sect);
      while (myNode.firstChild) {
        myNode.removeChild(myNode.lastChild);
      }
    if (call_section_dict[call_section] != false){
        var control_buts = make_html('div', ['control_buts', call_section], {'class':' col-12 ml-0 mb-0 mt-2 pl-0'}, '', header_sect);
        var return_list = make_html('button', ['cs', 'hold', call_section], {'class':'btn btn-outline-warning mt-0 ml-0', 'onclick':'hold_call('+call_section+')'}, '', control_buts[1]);
        var return_list = make_html('i', [], {'class':'fas fa-fw fa-pause', 'style':'margin-top: 4px;'}, '', return_list[1]);
        var return_list = make_html('button', ['cs', 'stop', call_section], {'class':'btn btn-outline-danger mt-0 ml-2', 'onclick':'stop_call('+call_section+')'}, '', control_buts[1]);
        var return_list = make_html('i', [], {'class':'fas fa-fw fa-phone-slash', 'style':'margin-top: 4px;'}, '', return_list[1]);
        if (call_section > 1){
            prev_control_buts = 'control_buts_' + (call_section-1)
            var return_list = make_html('button', ['cs', 'redirect', call_section], {'class':'btn btn-outline-info mt-0 ml-4', 'onclick':'redirect_call('+(call_section-1)+', '+call_section+')'}, 'Соединить с '+caller_id, prev_control_buts);
        }
    }

    if (total_direction != 'outbound'){
        var return_list = make_html('i', [], {'class':"fas fa-fw fa-sign-in-alt mb-2  mr-1", 'style':'color: #28a745; margin-top: 21px;', 'title':'Входящий вызов'}, '', header_sect);
    } else {
        var return_list = make_html('i', [], {'class':"fas fa-fw fa-sign-out-alt mb-2  mr-1", 'style':'color: #dc3545; margin-top: 21px;', 'title':'Исходящий вызов'}, '', header_sect);
    }
    var return_list = make_html('h5', ['cs', 'phone', call_id, call_section], {'class':'font-weight-bold mb-4 mt-3'}, caller_id, header_sect);
    var return_list = make_html('h5', ['cs', 'sep', call_id, call_section], {'class':'ml-2 mb-4 mt-3'}, '-', header_sect);
    var return_list = make_html('h5', ['cs', 'dt', call_id, call_section], {'class':'ml-2 mb-4 mt-3'}, datetime_start, header_sect);



    //console.log(active_uuid)
    if (call_section_dict[call_section] == false){
        document.getElementById('vizov_btn').innerText = 'Вызов по номеру'
        vizov_btn = 'call'
        make_audio(project_name, datetime_start, a_line_num, special_key_call, call_id, total_direction, audio_part_2, audio_sect)
        $("#module_butts").fadeOut(300);
        //audio_link = 'http://188.225.83.87:85/'
        //folder = project_name
        //if (folder != undefined){
        //    folder = folder.replace('@', '_at_')
        //}
        //audio_link += folder +'/'
        //dt_to_clear = datetime_start
        //while (dt_to_clear.includes(' ')){
        //    dt_to_clear = dt_to_clear.replace(' ', '-')
        //}
        //while (dt_to_clear.includes(':')){
        //    dt_to_clear = dt_to_clear.replace(':', '-')
        //}
        //audio_link += dt_to_clear+'.'+a_line_num+'.'+caller_id+'.'+special_key_call+'.mp3'
        //var return_list = make_html('audio', ['cs', 'ac', call_id], {'controls':""}, '', 'audio_sect');
        //var return_list = make_html('source', ['cs', 'as', call_id], {'src':audio_link, 'type':"audio/mpeg"}, '', return_list[1]);
    } else {
            time_to_parse = active_call_section_dict[call_section]['active_datetime_start'].replace(' ', 'T')
            parsed_time = Date.parse(time_to_parse)

            var timeInMs = Date.now();
            //var dif = timeInMs.getTime() - parsed_time.getTime();
            var dif  = timeInMs - parsed_time;
            var Seconds_from_T1_to_T2 = dif / 1000;
            var Seconds_Between_Dates = Math.round(Math.abs(Seconds_from_T1_to_T2))
            //console.log(Seconds_Between_Dates)

            var return_list = make_html('div', ['time_row', call_section], {'class':'row col-12'}, '', audio_sect);
            var ret = make_html('p', ['active_viz', call_section], {'class':'mr-2 font-weight-bold text text-success'}, 'Вызов активен -', return_list[1]);
            var ret = make_html('label', ['minutes', call_section], {}, '00', return_list[1]);
            var ret = make_html('p', ['dots'], {'class':'mx-1'}, ':', return_list[1]);
            if (Seconds_Between_Dates < 10){
                var ret = make_html('label', ['seconds', call_section], {}, '0'+Seconds_Between_Dates, return_list[1]);
            } else {
                var ret = make_html('label', ['seconds', call_section], {}, Seconds_Between_Dates, return_list[1]);
            }
            minutes_id = "minutes_"+call_section
            seconds_id = "seconds_"+call_section
            var minutesLabel = document.getElementById(minutes_id);
            var secondsLabel = document.getElementById(seconds_id);
            var totalSeconds = Seconds_Between_Dates;
            //interval_id = setInterval(setTime, 1000);
            interval_id_dict[call_section] = setInterval(setTime, 1000);

            function setTime() {
              ++totalSeconds;
              secondsLabel.innerHTML = pad(totalSeconds % 60);
              minutesLabel.innerHTML = pad(parseInt(totalSeconds / 60));
            }

            function pad(val) {
              var valString = val + "";
              if (valString.length < 2) {
                return "0" + valString;
              } else {
                return valString;
              }
            }

    }
    if (project_name in monitor_projects){

        var ret = make_html('h5', ['cs', 'projj', call_id], {'class':'mt-4 mb-4 mr-4'}, 'Проект - '+monitor_projects[project_name], body_sect);
    } else {
        var ret = make_html('h5', ['cs', 'projj', call_id], {'class':'mt-4 mb-4 mr-4'}, 'Проект - '+project_name, body_sect);
    }

    var return_list = make_html('div', ['cs', 'reas_row', call_id, call_section], {'class':'row col-12 mb-2'}, '', body_sect);
    if (call_section == 1){
        var ret = make_html('p', ['cs', 'dt', call_id], {'class':'mt-3 mb-4 mr-4'}, 'Причина звонка', return_list[1]);
        r_dict = {'class':"form-control mt-3 col"}
        if (call_section_dict[call_section] != false){
            r_dict['onclick'] = 'change_stop()'
            r_dict['onchange'] = 'change_stop()'
        }
        ret = make_html('select', ['cs', 'reason', call_id, call_section], r_dict, '',  return_list[1]);
            for (s in fs_reasons){
                fs_line = fs_reasons[s]
                search_p = project_name
                if ((search_p == 'api_call') || (search_p == 'no_project_out')){
                    search_p = 'outbound'
                }
                //console.log(search_p)
                //console.log(fs_line['project_name'])
                if (search_p == fs_line['project_name']){
                make_html('option', [], {'value':fs_line['id'], 'title':fs_line['description']}, fs_line['name'], ret[1]);
                }
            }
                ret[0].value = call_reason
        r_dict = {'class':"form-control mt-2 mb-4 col"}
        if (call_section_dict[call_section] != false){
            r_dict['onclick'] = 'change_stop()'
            r_dict['onchange'] = 'change_stop()'
        }
         var return_list = make_html('div', ['cs', 'res_row', call_id, call_section], {'class':'row col-12 mb-2'}, '', body_sect);
         var ret = make_html('p', ['cs', 'dt', call_id, call_section], {'class':'mt-2 mb-4 mr-4'}, 'Результат звонка', return_list[1]);
         ret = make_html('select', ['cs', 'result', call_id, call_section], r_dict, '',  return_list[1]);

            for (s in fs_results){
                fs_line = fs_results[s]
                //console.log(fs_line)
                search_p = project_name
                if ((search_p == 'api_call') || (search_p == 'no_project_out')){
                    search_p = 'outbound'
                }
                if (search_p == fs_line['project_name']){
                make_html('option', [], {'value':fs_line['id'], 'title':fs_line['description']}, fs_line['name'], ret[1]);
                }
            }

                ret[0].value = call_result

        var return_list = make_html('div', ['cs', 'as_is_row', call_id, call_section], {'class':'row col-12 mb-2'}, '', body_sect);
        as_is_filled = {}
        console.log('as_is_dict', as_is_dict)
        for (as in as_is_dict){
            as_line = as_is_dict[as]
            if (as_line['project_name'] == search_p){
                var as_list = make_html('div', ['cs', 'as_is', as, call_id, call_section], {'class':'row col-12 mb-2'}, '', return_list[1]);
                var ret = make_html('p', ['cs', 'dt', as, call_id, call_section], {'class':'mt-2 mb-2 mr-3'}, as_line['field_name']+':', as_list[1]);


                field_id = ['as', as, call_id, call_section]

            r_dict['onchange'] = 'change_stop()'
                try{
                    base_val = base_fields[as_line['field_id']]
                }catch {
                    base_val = ''
                }
                if (base_val == undefined){
                    base_val = ''
                }
                if (as_line['editable'] == true){
                as_is_filled[as_line['field_id']] = {'field_id':list_combiner(field_id), 'field_type':as_line['field_type']}
                if (as_line['field_type'] == 'regular'){
                    ret = make_html('input', field_id, {'class':'form-control mt-2 mb-2 col', 'type':'text', 'onclick':'change_stop()', 'oninput':'change_stop()', 'onchange':'change_stop()', 'value':base_val}, '',  as_list[1]);
                } else if (as_line['field_type'] == 'number'){
                    ret = make_html('input', field_id, {'class':'form-control mt-2 mb-2 col', 'type':'number', 'onclick':'change_stop()', 'oninput':'change_stop()', 'onchange':'change_stop()', 'value':base_val}, '',  as_list[1]);
                } else if (as_line['field_type'] == 'date'){
                    ret = make_html('input', field_id, {'class':'form-control mt-2 mb-2 col', 'type':'date', 'onclick':'change_stop()', 'oninput':'change_stop()', 'onchange':'change_stop()', 'value':base_val}, '',  as_list[1]);
                } else if (as_line['field_type'] == 'time'){
                    ret = make_html('input', field_id, {'class':'form-control mt-2 mb-2 col', 'type':'time', 'onclick':'change_stop()', 'oninput':'change_stop()', 'onchange':'change_stop()', 'value':base_val}, '',  as_list[1]);
                } else if (as_line['field_type'] == 'select'){

                    var splitted = as_line['field_vals'].split(',');
                    console.log('base_val', base_val)
                    if (!(splitted.includes(base_val))){
                        splitted.push(base_val)
                    }
                    make_selectize(as_list[1], field_id, base_val, splitted[0], splitted[0], splitted, false, change_stop(), '', '250px', '10px;')


                    //ret = make_html('select', field_id, {'class':'form-control mt-2 mb-2 col', 'onclick':'change_stop()', 'oninput':'change_stop()', 'onchange':'change_stop()'}, '',  as_list[1]);


                    //for (opt in splitted){
                    //    make_html('option', [], {'value':splitted[opt]}, splitted[opt],  ret[1]);
                    //}
                    //if (base_val != ''){
                    //    ret[0].value =  base_val
                    //}

                } else if (as_line['field_type'] == 'many'){
                    ret = make_html('div', field_id, {'class':'row col'}, '',  as_list[1]);
                    var splitted = as_line['field_vals'].split(',');
                    //console.log('splitted', splitted)
                    as_is_filled[as_line['field_id']]['field_id'] = {}
                    base_vas_split = []
                    if (base_val != ''){
                        if (base_val.includes(',')){
                            while (base_val.includes(', ')){
                                base_val = base_val.replace(', ', ',')
                            }
                            base_vas_split = base_val.split(',');
                        } else {
                            base_vas_split = [base_val]
                        }
                    }
                    for (opt in splitted){
                        //console.log(opt)
                        //var retud = make_html('div', ['as', as, call_id, call_section, opt, 'div'], {'class':'mt-2'}, '', ret[1]);
                        var retu = make_html('label', ['as', as, call_id, call_section, opt, 'label'], {'class':'form-check mt-2 mr-3'}, '', ret[1]);
                        as_is_check_dict = {'class':'form-check-input', 'type':"checkbox", 'style':"margin-top:7px;",  'onclick':'change_stop()', 'oninput':'change_stop()', 'onchange':'change_stop()'}

                        as_is_filled[as_line['field_id']]['field_id'][splitted[opt]] = list_combiner(['as', as, call_id, call_section, opt, 'check'])
                        input_ch = make_html('input', ['as', as, call_id, call_section, opt, 'check'], as_is_check_dict, '', retu[1]);
                        make_html('span', [], {'class':'form-check-label'}, splitted[opt], retu[1]);
                        if (base_vas_split.includes(splitted[opt])){
                            input_ch[0].checked = true
                        }
                    }
                }
                } else {
                    field_idd = list_combiner(field_id)
                    as_is_filled[as_line['field_id']] = {'field_id':field_idd, 'field_type':'non_editable'}
                    ret = make_html('p', field_id, {'class':'mt-2 mb-2'}, base_val,  as_list[1]);
                }
            }
        }
        //console.log('as_is_filled', as_is_filled)



        r_dict = {'class':"form-control col-12 mt-2 mb-4", 'placeholder':'Комментарий к вызову'}
        if (call_section_dict[call_section] != false){
            r_dict['onclick'] = 'change_stop()'
            r_dict['onchange'] = 'change_stop()'
            r_dict['oninput'] = 'change_stop()'
        }
        ret = make_html('textarea', ['cs', 'textar', call_id, call_section], r_dict, user_comment,  body_sect);
    }
    var return_list = make_html('div', ['cs', 'sav', call_id, call_section], {'class':'row col-12 mb-4 pt-0 mt-1'}, '', body_sect);
    if (call_section_dict[call_section] == false){
        if (call_section == 1){
            var return_list = make_html('button', ['cs', 'call', call_id, call_section], {'class':'btn btn-outline-success mt-0 ml-2', 'onclick':'save_call_edit('+call_id+', '+call_section+', "'+project_name+'")'}, 'Сохранить', return_list[1]);
        }
    }
    call_shower_finished = true
}

function hold_call(call_section){
    socket_click.emit('sofia_operations', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'uuid':active_section_dict[call_section], 'action':'hold_toggle'})

}

function stop_call(call_section){
    idle_set = false
    if (call_section == 1){
        idle_set = true
    }
    socket_click.emit('sofia_operations', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'uuid':active_section_dict[call_section], 'action':'uuid_break', 'idle_set':idle_set})
}

function redirect_call(call_section, call_section_1){
    socket_click.emit('sofia_operations', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'uuid':active_section_dict[call_section], 'uuid_2':active_section_dict[call_section_1], 'action':'uuid_bridge'})
}

function change_stop(){
    post_stop = 0
}

function over_call(call_line, call_section){

    console.log('over_call_start', 'call_section', call_section)

    if (out_active_project_name != ''){
        socket_click.emit('outbound_calls', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'project_pool':project_pool, 'action':'update_phone_to_call', 'assigned_key':assigned_key, 'log_status':'finished', 'phone_status':'finished', 'special_key':out_active_phone['special_key'], 'project_name':out_active_project_name})
    }

    if (cur_dir != 'outbound'){
        caller_id = call_line['caller_id']
    } else {
        caller_id = call_line['destination_id']
    }

    datetime_start = call_line['datetime_start']
    project_name = call_line['project_name']
    if (cur_dir != 'outbound'){
        a_line_num = call_line['a_line_num']
    } else {
        a_line_num = call_line['caller_id']
    }


    post_seconds_limit = 15
    if (login.includes('fs.at.akc24.ru')){
        post_seconds_limit = 120
    }

    active_call_section_dict[1]['datetime_start'] = call_line['datetime_start']
    active_call_section_dict[1]['datetime_end'] = call_line['datetime_end']

    special_key_call = call_line['special_key_call']
    call_reason = call_line['call_reason']
    call_result = call_line['call_result']
    user_comment = call_line['user_comment']
    make_audio(project_name, datetime_start, a_line_num, special_key_call, call_id, call_line['total_direction'], call_line['record_name'], 'audio_sect_1')
    sav_place = list_combiner(['cs', 'sav', 'active', 1])
    //console.log(sav_place)
    var return_list = make_html('button', ['cs', 'call', 'active', call_section], {'class':'btn btn-outline-success mt-0 ml-2', 'onclick':'save_call_edit('+call_line['id']+', '+call_section+', "'+project_name+'")'}, 'Сохранить', sav_place);
    var return_list = make_html('label', ['post_seconds', call_section], {'class':'font-weight-bold ml-2 mt-3'}, post_seconds_limit, sav_place);
    var return_list = make_html('p', ['post_text', call_section], {'class':'ml-1 mt-3'}, 'сек. на постобработку', sav_place);

    post_seconds = 0
    post_stop = 5
    var post_secondsLabel = document.getElementById("post_seconds_"+call_section);

    postobrabotka_id = setInterval(postTime, 1000);
    postobrabotka_stop = setInterval(post_stop_Time, 1000)
    console.log('post_started', 'call_section', call_section)
    if (call_section == 1){
        socket_click.emit('fs_post_started', {'fs_server':fs_server, 'sip_login':sip_login, 'worker':login, 'session_key':session_key})
    }
    function postTime() {

      if (post_seconds < post_seconds_limit){
        if (post_stop > 5){
            ++post_seconds;
            post_secondsLabel.innerHTML = post_seconds_limit - post_seconds % 60;
        }
      } else {
        clearInterval(postobrabotka_id);
        change_state_fs('waiting', 'auto_return')
        //active_uuid_post = true
        post_call_section_dict[call_section] = true
        console.log('call_false_3')
        if (call_section == 1){
            console.log('out_extensions_zero_1')
            out_extensions = {}
        }

        call_section_dict[call_section] = false
        active_section_dict[call_section] = false
         post_stop = 5
         clearInterval(postobrabotka_id);
         clearInterval(postobrabotka_stop);
         postobrabotka_id = undefined
         postobrabotka_stop = undefined;
         active_caller_id = ''
         active_call_section_dict[1]['uuid'] = ''
         document.getElementById('post_seconds_'+call_section).remove()
         document.getElementById('post_text_'+call_section).remove()

         out_active_phone = {}
         out_active_project_name = ''
         out_active_start_type = ''
         out_active_start = ''
         out_active_taken_reason = ''
         assigned_key = ''

      }

    }
    function post_stop_Time() {
        ++post_stop

    }
    socket_click.emit('get_fs_report', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'level':(level-1)*onpage})
}

async function save_call_edit(call_id, call_section, save_project_name){
    call_section = 1
    active_fs_report_line = fs_report_dict[call_id]
    active_call_id = call_id
    //console.log('modules_after_save', modules_after)
    console.log(call_section_dict[call_section])
    console.log(post_call_section_dict[call_section] != true)
    if ((call_section_dict[call_section] == false)&&(post_call_section_dict[call_section] != true)){
        call_adr = call_id
        call_to_show = undefined
    } else {
        call_adr = 'active'
        call_to_show = call_id
    }

    call_result = document.getElementById('cs_result_'+ call_adr+'_'+call_section).value
    hash_ii = '#cs_result_'+ call_adr+'_'+call_section
    result_text = $(hash_ii).children(':selected').text();
    call_reason = document.getElementById('cs_reason_'+ call_adr+'_'+call_section).value
    hash_ii = '#cs_reason_'+ call_adr+'_'+call_section
    reason_text = $(hash_ii).children(':selected').text();

    comment = document.getElementById('cs_textar_'+ call_adr+'_'+call_section).value

    ok_to_send = true
    if ((save_project_name == 'leto@default')||(save_project_name == 'ambar@default')){
        if ((comment == '') || (call_reason == '') || (call_result == '') || (comment == null) || (call_reason == null) || (call_result == null)){
            ok_to_send = false
            Swal.fire({
              title: "Не заполнены обязательные поля",
              text: 'Проверьте корректность заполнения полей',
              icon: "warning",
            });
        }

    }
    if (ok_to_send == true){
        if (modules_after.length > 0){

            for (m_id in modules_after){
                mo_line = modules_after[m_id]
                module_run(mo_line[0], mo_line[1], mo_line[2], mo_line[3], call_section)
                //console.log('module_run', mo_line[0], mo_line[1], mo_line[2], mo_line[3], call_section)
            }
        }
        post_call_section_dict[call_section] = false
    }
    //while (after_finish != modules_after.length){
    //    sleep(500)
    //    console.log('wait', after_finish, modules_after.length)
    //}




    as_is_emit = {}
    if (Object.keys(as_is_filled).length > 0){
        for (as_id in as_is_filled){
            if ((as_is_filled[as_id]['field_type'] != 'many') && (as_is_filled[as_id]['field_type'] != 'non_editable')){



                as_is_emit[as_id] = document.getElementById(as_is_filled[as_id]['field_id']).value
                console.log('as_is_emit', as_is_emit[as_id])
            } else if (as_is_filled[as_id]['field_type'] == 'many') {
                many_text = ''
                for (man in as_is_filled[as_id]['field_id']){
                    if (document.getElementById(as_is_filled[as_id]['field_id'][man]).checked == true){
                        if (many_text.length > 0){
                            many_text += ', '
                        }
                        many_text += man
                    }
                }
                as_is_emit[as_id] = many_text
            } else if (as_is_filled[as_id]['field_type'] == 'non_editable'){
                as_is_emit[as_id] = document.getElementById(as_is_filled[as_id]['field_id']).innerText
            }

        }
    }


    //console.log('as_is_emit', as_is_emit)
    if (ok_to_send == true){
        if (call_section_dict[call_section] != false){
             change_state_fs('waiting', 'finished post obrabotka')
             console.log('call_false_4')
             call_section_dict[call_section] = false
             console.log('out_extensions_zero_2')
             out_extensions = {}
             active_section_dict[call_section] = false
             post_stop = 5
             clearInterval(postobrabotka_id);
             clearInterval(postobrabotka_stop);
             postobrabotka_id = undefined
             postobrabotka_stop = undefined;
             try{
                document.getElementById('post_seconds_'+call_section).remove()
             } catch{

             }
             try{
                document.getElementById('post_text_'+call_section).remove()
             } catch{

             }
        }

        $("#module_butts").fadeOut(300);
        socket_click.emit('edit_call_fs', {'fs_server':fs_server, 'call_id':call_id, 'call_result':call_result, 'call_reason':call_reason, 'comment':comment, 'session_key':session_key, 'worker':login, 'base_fields':as_is_emit, 'result_text':result_text, 'reason_text':reason_text})

        if (out_active_project_name != ''){
            if (call_section == 1){
                hash_ii = '#cs_result_'+ call_adr+'_'+call_section
                resultt = $(hash_ii).children(':selected').text();
                socket_click.emit('outbound_calls', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'project_pool':project_pool, 'action':'update_phone_to_call', 'assigned_key':assigned_key, 'base_fields':as_is_emit, 'log_status':'saved', 'phone_status':resultt, 'special_key':out_active_phone['special_key'], 'project_name':out_active_project_name})
            }
        }

        active_caller_id = ''
        active_call_section_dict[1]['uuid'] = ''
        out_active_phone = {}
        out_active_project_name = ''
        out_active_start_type = ''
        out_active_start = ''
        out_active_taken_reason = ''
        assigned_key = ''
        after_finish = 0
        for (cc_id in call_secs){
            ccc = call_secs[cc_id]

            call_section_dict[ccc] = false
            active_call_section_dict[ccc]['active_direction'] = ''
            active_call_section_dict[ccc]['uuid'] = ''
            active_call_section_dict[ccc]['b_uuid'] = ''
            active_call_section_dict[ccc]['active_caller_id'] = ''
            active_call_section_dict[ccc]['active_datetime_start'] = ''
            active_call_section_dict[ccc]['active_caller_id'] = ''
            active_call_section_dict[ccc]['active_datetime_start'] = ''
            active_call_section_dict[ccc]['datetime_start'] = ''
            active_call_section_dict[ccc]['datetime_end'] = ''
        }
    }
}

break_reasons = {
          'break':  {'text': 'Перерыв'},
          'study': {'text': 'Обучение'},
          'admin': {'text': 'Административный'},
          'lunch': {'text': "Обед"},
          'api_call': {'text': "Исходящий вызов"},
          'db_compare': {'text': "Принудительный"},}

fs_stat_dict = {'Available': {'text':'На линии', 'color':'success', 'button':'Перейти к обработке вызовов', 'dop':'logout'},
    'Available (On Demand)': {'text':'На линии', 'color':'success', 'button':'Перейти к обработке вызовов', 'dop':'logout'},
    'Logged Out': {'text':'Выключен', 'color':'danger', 'button':'Выйти на линию', 'dop':'no'},
    'On Break':  {'text':'Перерыв', 'color':'warning', 'button':'Выйти на линию', 'dop':'no'},
    'Post' : {'text':'Постобработка', 'color':'warning', 'button':'Перейти к обработке вызовов', 'dop':'logout'},

    'Registered': {'text':'Авторизован', 'color':'success', 'start_disabled': false},
    'Unregistered': {'text':'Выключен', 'color':'danger', 'start_disabled': true},
    }


function fs_statuses_show(fs_status_d){

        hash_logout = '#logout'
        hash_pause = '#pause'
        hash_field = '#online'
        hash_auth = '#auth'
        hash_start = '#start_call'
        fs_state = fs_status_d['state']
        fs_status = fs_status_d['status']
        if ((fs_status.includes('Available')) && (fs_state == 'Idle')){
            fs_status = 'Post'
        }
        //console.log('On Break', fs_status == 'On Break')
        if (fs_status == 'On Break'){
            //console.log('back_on_line', (break_reason == 'api_call'), (postobrabotka_id == undefined))
            if ((break_reason == 'api_call') && (postobrabotka_id == undefined) && (call_initiation == false)){
                //console.log('call_section_dict', call_section_dict)
                back_on_line_check = true
                for (c_check in call_section_dict){

                    if (call_section_dict[c_check] != false){
                        back_on_line_check = false
                    }
                }
                    if (back_on_line_check == true){
                        back_on_line += 1
                    } else {
                        back_on_line = 0
                    }
                    if (back_on_line > 3){
                        out_preparation = false
                        call_initiation = false
                        Swal.fire({
                          title: "Ошибка при наборе номера",
                          text: 'Сейчас вы будете возвращены на линию автоматически.',
                          icon: "warning",
                        });
                        start_fs_with_reason('back_on_line', false)
                        change_state_fs('waiting', 'outbound_error')
                        socket_click.emit('outbound_calls', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'project_pool':project_pool, 'action':'update_phone_to_call', 'assigned_key':assigned_key, 'log_status':'number_error', 'phone_status':'number_error', 'special_key':out_active_phone['special_key'], 'project_name':out_active_project_name})
                        back_on_line = 0
                        out_active_phone = {}
                        out_active_project_name = ''
                        out_active_start_type = ''
                        out_active_start = ''
                        out_active_taken_reason = ''
                        assigned_key = ''
                    }

            } else {
                back_on_line = 0
            }

            if (break_status == false){
                socket_click.emit('get_break', {'fs_server':fs_server, 'sip_login':sip_login, 'room_id':room_id, 'worker':login, 'session_key':session_key, 'get_type':'new'})
            } else {
                if (break_reason == 'api_call'){
                   api_call_active = true
                } else {
                   api_call_active = false
                }
                try{
                document.getElementById('status').innerText = break_reasons[break_reason]['text']
                } catch {
                document.getElementById('status').innerText = 'Принудительный - ошибка'
                }
                document.getElementById('status').className = "font-weight-bold mb-1 text text-"+fs_stat_dict[fs_status]['color'];
            }
        } else {
            back_on_line = 0
            api_call_active = false
            b_totalSeconds = 0
            var myNode = document.getElementById('time_place');
              while (myNode.firstChild) {
                myNode.removeChild(myNode.lastChild);
              }
            break_status = false
            break_reason = false
            document.getElementById('status').innerText = fs_stat_dict[fs_status]['text']
            document.getElementById('status').className = "font-weight-bold mb-1 text text-"+fs_stat_dict[fs_status]['color'];
        }



        if (fs_stat_dict[fs_status]['dop'] != 'no'){
            $(hash_logout).fadeIn().show();
             if (fs_status != 'Post'){
                $(hash_pause).fadeIn().show();
             }
            $(hash_field).fadeOut(300);
            $(hash_start).fadeIn().show();
        } else {
            //$(hash_start).fadeOut(300);
            $(hash_field).fadeIn().show();
            $(hash_logout).fadeOut(300);
            $(hash_pause).fadeOut(300);
        }
        if (fs_status == 'Post'){
            $('#post_stop').fadeIn().show();
            $('#pause').fadeOut(300);
        } else {
            $('#post_stop').fadeOut(300);
        }

        sofia = fs_status_d['sofia_status']
        if (sofia.includes('Registered')){
            sofia = 'Registered'
        }



        document.getElementById('sofia_status').innerText = fs_stat_dict[sofia]['text']
        document.getElementById('sofia_status').className = "font-weight-bold mt-0 mb-0 text text-"+fs_stat_dict[sofia]['color'];


        if (fs_stat_dict[sofia]['start_disabled'] == true){
           $(hash_field).fadeOut(300);
            $(hash_auth).fadeIn().show();

        } else{
            if (fs_stat_dict[fs_status]['dop'] == 'no'){
                $(hash_field).fadeIn().show();
            }
           $(hash_auth).fadeOut(300);
        }

}


function post_stop_fs(){
    clearInterval(postobrabotka_id);
    change_state_fs('waiting', 'manual_return')
    //active_uuid_post = true
    post_call_section_dict[call_section] = true
     console.log('call_false_5')
    call_section_dict[call_section] = false
    console.log('out_extensions_zero_3')
    out_extensions = {}
    active_section_dict[call_section] = false
     post_stop = 5
     clearInterval(postobrabotka_id);
     clearInterval(postobrabotka_stop);
     postobrabotka_id = undefined
     postobrabotka_stop = undefined;
     active_caller_id = ''
     active_call_section_dict[1]['uuid'] = ''
     document.getElementById('post_seconds_'+call_section).remove()
     document.getElementById('post_text_'+call_section).remove()

     out_active_phone = {}
     out_active_project_name = ''
     out_active_start_type = ''
     out_active_start = ''
     out_active_taken_reason = ''
     assigned_key = ''

     for (cc_id in call_secs){
        ccc = call_secs[cc_id]

        call_section_dict[ccc] = false
        active_call_section_dict[ccc]['active_direction'] = ''
        active_call_section_dict[ccc]['uuid'] = ''
        active_call_section_dict[ccc]['b_uuid'] = ''
        active_call_section_dict[ccc]['active_caller_id'] = ''
        active_call_section_dict[ccc]['active_datetime_start'] = ''
        active_call_section_dict[ccc]['active_caller_id'] = ''
        active_call_section_dict[ccc]['active_datetime_start'] = ''
        active_call_section_dict[ccc]['datetime_start'] = ''
        active_call_section_dict[ccc]['datetime_end'] = ''
    }

}

async function pause_fs(){
    const { value: rest } = await Swal.fire({
      title: 'Укажите причину перерыва',
      input: 'select',
      inputOptions: {
          'break': 'Перерыв',
          'study': 'Обучение',
          'admin': 'Административный',
          'lunch': "Обед",
      },
      inputPlaceholder: 'Выберите опцию',
      showCancelButton: true,
      inputValidator: (value) => {
        return new Promise((resolve) => {
          //console.log(value)
          if (value != '') {
            resolve()
          } else {
            resolve('Пожалуйста укажите причину выхода на перерыв')
          }
        })
       }
    })

    if (rest) {
        socket_click.emit('change_stat_fs', {'fs_server':fs_server, 'sip_login':sip_login, 'room_id':room_id, 'worker':login, 'session_key':session_key, 'action':'pause', 'reason':rest, 'page':'online'})

    }
}

function logout_fs(){
    socket_click.emit('change_stat_fs', {'fs_server':fs_server, 'sip_login':sip_login, 'room_id':room_id, 'worker':login, 'session_key':session_key, 'action':'logout', 'page':'online'})
}

function start_fs(){
    socket_click.emit('change_stat_fs', {'fs_server':fs_server, 'sip_login':sip_login, 'room_id':room_id, 'worker':login, 'session_key':session_key, 'action':'available', 'page':'online'})
    api_call_active = false
    call_initiation = false
    out_preparation = false
}

function start_fs_with_reason(reason_fs, idle_set){
    socket_click.emit('change_stat_fs', {'fs_server':fs_server, 'sip_login':sip_login, 'room_id':room_id, 'worker':login, 'session_key':session_key, 'action':'available', 'page':'online','reason':reason_fs, 'idle_set':idle_set})
    api_call_active = false
    call_initiation = false
    out_preparation = false
}

function change_state_fs(state, reason){
    socket_click.emit('change_state_fs', {'fs_server':fs_server, 'sip_login':sip_login, 'room_id':room_id, 'worker':login, 'session_key':session_key, 'state':state, 'reason':reason, 'page':'online'})
}

function fs_call_shower(call_line, call_section){

    //console.log('call_line', call_line)
    //console.log(active_section_dict)
    if (call_line != undefined){

        if (Object.keys(call_line).length > 1){
            if (active_section_dict[call_section] == ''){
                    active_section_dict[call_section] = call_line['uuid']

                } else if (direction == 'outbound'){
                    if (call_line['b_dest'] != sip_login){
                        active_section_dict[call_section] = call_line['b_uuid']
                    } else if ((call_line['context'] == 'default')) {
                        active_section_dict[call_section] = call_line['b_uuid']
                    }
            }
            //console.log('------ call_section_dict', call_section, out_active_project_name, call_section_dict)
            if (call_section_dict[call_section] == false){



                document.getElementById('vizov_btn').innerText = 'Перевести'
                vizov_btn = 'redirect'
                console.log('vizov_btn_1', vizov_btn)
                if ((sip_login == call_line['b_dest']) || (sip_login == call_line['callee_num'])){
                    direction = 'inbound'
                } else if (sip_login == call_line['cid_num']) {
                    direction = 'outbound'
                }
                cur_dir = direction

                console.log('call_line', call_line)
                if (direction == 'inbound'){

                    if ((call_section == 1) && (got_callcenter_queues == false)){
                        socket_click.emit('get_callcenter_queues', {'fs_server':fs_server,  'room_id':room_id, 'worker':login, 'session_key':session_key, 'uuid':call_line['uuid'], 'b_uuid':call_line['b_uuid'], 'phone':call_line['cid_num']})
                    }

                    active_uuid = call_line['b_uuid']

                    if (active_uuid != ''){
                    console.log('call_set_1')
                    call_section_dict[call_section] = active_uuid
                    active_section_dict[call_section] = call_line['uuid']

                    active_call_section_dict[call_section]['active_direction'] = direction
                    active_call_section_dict[call_section]['uuid'] = call_line['uuid']
                    active_call_section_dict[call_section]['b_uuid'] = call_line['b_uuid']
                    active_call_section_dict[call_section]['active_caller_id'] = call_line['cid_num']
                    active_call_section_dict[call_section]['active_datetime_start'] = call_line['b_created']


                    active_call_section_dict[call_section]['cid_num'] = call_line['cid_num']
                    active_call_section_dict[call_section]['dest'] = call_line['dest']

                    if (call_section == 1){
                        active_caller_id = call_line['cid_num']
                    }
                    //console.log('call_line', call_line)
                        console.log('sent_dia_dest', call_section)
                        socket_click.emit('get_fs_dia_dest', {'fs_server':fs_server,  'room_id':room_id, 'worker':login, 'session_key':session_key, 'uuid':call_line['uuid'], 'b_uuid':call_line['b_uuid'], 'phone':call_line['cid_num'],
                        'direction':call_line['direction'], 'caller_id':call_line['dest'], 'destination_number':call_line['dest'], 'cid_name':call_line['cid_name'], 'call_section':call_section})
                    }
                } else if (direction == 'outbound'){
                    if (call_line['b_dest'] != sip_login){

                        active_uuid = call_line['uuid']
                        if (active_uuid != ''){
                        console.log('call_set_2')
                        call_section_dict[call_section] = active_uuid
                        active_section_dict[call_section] = call_line['b_uuid']
                        active_call_section_dict[call_section]['active_caller_id'] = call_line['b_dest']
                        if (call_section == 1){
                            active_caller_id = call_line['b_dest']
                        }
                        if (active_call_section_dict[call_section]['active_caller_id'] == ''){
                            //console.log('-______-')
                            active_call_section_dict[call_section]['active_caller_id'] = call_line['callee_num']
                            if (call_section == 1){
                                active_caller_id =call_line['callee_num']
                            }
                            if (active_call_section_dict[call_section]['active_caller_id'] == ''){
                            active_call_section_dict[call_section]['active_caller_id'] = call_line['dest']
                            if (call_section == 1){
                                active_caller_id =call_line['dest']
                            }
                            }
                        }

                        active_call_section_dict[call_section]['active_direction'] = direction
                        active_call_section_dict[call_section]['uuid'] = call_line['uuid']
                        active_call_section_dict[call_section]['b_uuid'] = call_line['b_uuid']

                        active_call_section_dict[call_section]['cid_num'] = call_line['cid_num']
                        active_call_section_dict[call_section]['dest'] = call_line['dest']

                        active_call_section_dict[call_section]['active_datetime_start'] = call_line['created']
                        project_name = direction
                        a_line_num = ''
                        special_key_call = active_uuid
                        call_reason = ''
                        call_result = ''
                        user_comment = ''
                        call_id = 'active'
                        //console.log('get_out_start', get_out_start)
                        //console.log('out_base_fields', out_base_fields)
                        if (out_active_project_name != ''){
                        script_shower(out_active_project_name)
                        }
                        call_shower(call_id, active_call_section_dict[call_section]['active_caller_id'], active_call_section_dict[call_section]['active_datetime_start'], project_name, a_line_num, active_call_section_dict[call_section]['uuid'], call_reason, call_result, user_comment, direction, '', call_section, out_base_fields)



                        }

                    } else if ((call_line['context'] == 'default')) {
                        active_uuid = call_line['b_uuid']
                        if (active_uuid != ''){
                        console.log('call_set_3')
                        call_section_dict[call_section] = active_uuid
                        active_section_dict[call_section] = call_line['b_uuid']
                        active_call_section_dict[call_section]['active_caller_id'] = call_line['cid_num']
                        if (call_section == 1){
                                active_caller_id =call_line['cid_num']
                            }
                        active_call_section_dict[call_section]['active_datetime_start'] = call_line['b_created']

                        active_call_section_dict[call_section]['active_direction'] = direction
                        active_call_section_dict[call_section]['uuid'] = call_line['uuid']
                        active_call_section_dict[call_section]['b_uuid'] = call_line['b_uuid']


                        active_call_section_dict[call_section]['cid_num'] = call_line['cid_num']
                        active_call_section_dict[call_section]['dest'] = call_line['dest']

                        project_name = direction
                        a_line_num = ''
                        special_key_call = active_uuid
                        call_reason = ''
                        call_result = ''
                        user_comment = ''
                        call_id = 'active'
                        call_shower(call_id, active_call_section_dict[call_section]['active_caller_id'], active_call_section_dict[call_section]['active_datetime_start'], project_name, a_line_num, special_key_call, call_reason, call_result, user_comment, direction, '', call_section, {})
                        }
                    }
                }



            } else if ((call_section_dict[call_section] == call_line['uuid']) || (call_section_dict[call_section] == call_line['b_uuid'])) {
                //console.log(call_line['callstate'])
                active_viz = 'active_viz_'+call_section
                if ((call_line['callstate'] == 'HELD')||(call_line['b_callstate'] == 'HELD')){
                    document.getElementById(active_viz).innerText = 'На удержании - '
                    document.getElementById(active_viz).className = "mr-2 font-weight-bold text text-warning";
                } else {
                    document.getElementById(active_viz).innerText = 'Вызов активен -'
                    document.getElementById(active_viz).className = "mr-2 font-weight-bold text text-success";
                }
            }
        } else {
            //console.log(interval_id_dict)
            //console.log('pre_over', call_section, call_section in interval_id_dict, interval_id_dict[call_section], call_section_dict[call_section], call_section > 1)

            if (call_section == 1){
                document.getElementById('vizov_btn').innerText = 'Вызов по номеру'
                vizov_btn = 'call'
                got_callcenter_queues = false
            }
            got_callcenter_queues = false
            active_call_section_dict[call_section]['active_caller_id'] = ''
            active_call_section_dict[call_section]['active_datetime_start'] = ''
            if (interval_id_dict[call_section] != undefined){
                clearInterval(interval_id_dict[call_section]);
                interval_id_dict[call_section] = undefined
                if (call_section > 1){
                    console.log('call_false_1')
                    call_section_dict[call_section] = false

                    active_section_dict[call_section] = false
                    hash_call_section = '#call_section_'+call_section
                    $(hash_call_section).fadeOut(300);
                } else {
                //if (tot_dir == 'outbound'){
                //    change_state_fs('idle', 'finished out_call')
                //}
                    active_viz = 'active_viz_'+call_section
                    document.getElementById(active_viz).innerText = 'Завершение вызова'
                    if (call_section == 1){
                        console.log('out_extensions_zero_4')
                        out_extensions = {}
                    }
                    control_buts = 'control_buts_' + call_section
                     var myNode = document.getElementById(control_buts);
                      while (myNode.firstChild) {
                        myNode.removeChild(myNode.lastChild);
                      }
                    document.getElementById(active_viz).className = "mr-2 font-weight-bold text text-warning";
                    socket_click.emit('get_fs_report_line', {'worker':login, 'call_section':call_section, 'uuid':call_section_dict[call_section], 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server})
                    if (api_call_active == true){
                        start_fs_with_reason('call_over', true)
                        api_call_active == false
                    }

                }
            }
        }
    } else {
        //console.log(interval_id_dict)
        //    console.log('pre_over_2', call_section, call_section in interval_id_dict, interval_id_dict[call_section], call_section_dict[call_section], call_section > 1)

            if (call_section == 1){
                document.getElementById('vizov_btn').innerText = 'Вызов по номеру'
                vizov_btn = 'call'
                got_callcenter_queues = false
            }

            active_call_section_dict[call_section]['active_caller_id'] = ''
            active_call_section_dict[call_section]['active_datetime_start'] = ''
            if (interval_id_dict[call_section] != undefined){
                clearInterval(interval_id_dict[call_section]);
                interval_id_dict[call_section] = undefined
                if (call_section > 1){
                    console.log('call_false_2')
                    call_section_dict[call_section] = false

                    active_section_dict[call_section] = false
                    hash_call_section = '#call_section_'+call_section
                    $(hash_call_section).fadeOut(300);
                } else {
                //if (tot_dir == 'outbound'){
                //    change_state_fs('idle', 'finished out_call')
                //}
                    if (call_section == 1){
                        console.log('out_extensions_zero_5')
                        out_extensions = {}
                    }
                    active_viz = 'active_viz_'+call_section
                    document.getElementById(active_viz).innerText = 'Завершение вызова'
                    document.getElementById(active_viz).className = "mr-2 font-weight-bold text text-warning";
                    socket_click.emit('get_fs_report_line', {'worker':login, 'call_section':call_section, 'uuid':call_section_dict[call_section], 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server})
                }
            }
    }
}

function script_look(){

    call_section = 1
    hash_call_section = '#call_section_'+call_section
    $(hash_call_section).fadeIn().show();
    hash_call_section = '#call_section_2'
    $(hash_call_section).fadeOut(300);
    hash_call_section = '#call_section_3'
    $(hash_call_section).fadeOut(300);

    header_sect = 'header_sect_'+call_section
    body_sect = 'body_sect_'+call_section
    audio_sect = 'audio_sect_'+call_section

    var myNode = document.getElementById(header_sect);
      while (myNode.firstChild) {
        myNode.removeChild(myNode.lastChild);
      }
    var myNode = document.getElementById(body_sect);
      while (myNode.firstChild) {
        myNode.removeChild(myNode.lastChild);
      }
    var myNode = document.getElementById(audio_sect);
      while (myNode.firstChild) {
        myNode.removeChild(myNode.lastChild);
      }

     var return_list = make_html('input', ['script', 'looker'], {'class':'form-control-lg input ml-3 mt-2 mb-4 col-6', 'style':"border: 1px solid #11a5ed;", 'placeholder':'Найти скрипт',  'type':'text',
        }, '', header_sect);
    var return_list = make_html('button', ['script', 'looker', 'button'], {'class':'ml-3 btn btn-outline-info btn-lg mt-2 mb-4', 'style':'height:48px; padding-top:12px;','onclick':'look_for_script()'}, 'Открыть',  header_sect);

}

function look_for_script(){
    script_looker = document.getElementById('script_looker').value
    console.log('look_for_script', script_looker)
    socket_click.emit('script_operations', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'action':'start_script', 'init_mode':'find',
            'direction':'look', 'project_name':script_looker})

}

function paginator(p_count){

    total_levels = Math.ceil(p_count/onpage)

    var myNode = document.getElementById('paginator');
      while (myNode.firstChild) {
        myNode.removeChild(myNode.lastChild);
      }
    if (total_levels > 1){

        var return_lis = make_html('a', ['pages', 'left'], {'class':'mt-0 ml-0 mb-0 mr-0 px-0 btn btn-white', 'onclick':'pages_change("left")', 'style':'padding-top:1px;'}, '', 'paginator');
        var return_list = make_html('i', [], {'class':'mt-0 mb-1 fas fa-fw fa-angle-left', 'style':'color:#6c757d;'}, '', return_lis[1]);
        make_html('p', ['pages', 'num'], {'class':'text text-bold ml-1'}, level+' из ' + total_levels, 'paginator');
        var return_lis = make_html('a', ['pages', 'right'], {'class':'mt-0 ml-0 mb-0 mr-1 px-0 btn btn-white', 'onclick':'pages_change("right")', 'style':'padding-top:1px;'}, '', 'paginator');
        var return_list = make_html('i', [], {'class':'mt-0 mb-1 fas fa-fw fa-angle-right', 'style':'color:#6c757d;'}, '', return_lis[1]);
    }
}
left = moment()
right = moment()
hash_dr = '#date_range_search'
try{
dtr = $(hash_dr).daterangepicker({
            opens: 'left',
            startDate: left,
            endDate: right,
            locale : {
                format: 'DD.MM.YYYY'
            },
          }, function(start, end, label) {
            //custom_filter[f_n]  = start.format('YYYY-MM-DD') +' TO ' + end.format('YYYY-MM-DD')
            //filter_match()
          });
} catch (err) {
 console.log(err)
}

function date_phone_searcher(find){
    if (find == 'find'){
        date_range = document.getElementById('date_range_search').value
        phone_search = document.getElementById('phone_search').value

        //console.log(date_range, phone_search, 'sent')
        socket_click.emit('get_fs_report', {'worker':login, 'sip_login':sip_login,
        'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server,
        'level':(level-1)*onpage, 'date_range':date_range, 'phone_search':phone_search})
    } else if (find == 'no'){
        socket_click.emit('get_fs_report', {'worker':login, 'sip_login':sip_login,
        'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server,
        'level':(level-1)*onpage})
    }
}


function pages_change(direction){
    if (direction == 'right'){
        level = level + 1
        if (level > total_levels){
            level = 1
        }
    } else {
        level = level - 1
        if (level == 0){
            level = total_levels
        }
    }
    socket_click.emit('get_fs_report', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'level':(level-1)*onpage})

}

var canCall = false
var is_execute = false

function get_out_calls(){
    //console.log(fs_state, fs_status, sofia)
    console.log(canCall, is_execute)
    if ((canCall == false) && (is_execute == false)){
    is_execute = true
    my_projects = monitor_callcenter[sip_login]
    project_pool = []

    for (m_p in my_projects){
        p_name = my_projects[m_p]
        if (all_projects[p_name]['out_active'] == true){
            project_pool.push(p_name)
        }
    }
    //console.log('project_pool', project_pool, (project_pool.length > 0), active_call_section_dict[1]['uuid'], ((active_call_section_dict[1]['uuid'] == ''||active_call_section_dict[1]['uuid'] == undefined)), (sofia == 'Registered'), (fs_state == 'Waiting'), ((fs_status == 'Available')||(fs_status == 'Available (On Demand)')), (call_initiation == false), (out_preparation == false))
    if ((project_pool.length > 0) && ((active_call_section_dict[1]['uuid'] == ''||active_call_section_dict[1]['uuid'] == undefined)) &&(sofia == 'Registered') &&(fs_state == 'Waiting') &&((fs_status == 'Available')||(fs_status == 'Available (On Demand)')) && (call_initiation == false)  && (out_preparation == false)){
        //console.log('check_out')
        socket_click.emit('outbound_calls', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'project_pool':project_pool, 'action':'get_phone_to_call'})
    }
    canCall = true;
    setTimeout(() => {
      is_execute = false;

      canCall = false;
    }, 10000);
    console.log('CAME_OOOUUUUUT')
    is_execute = false;

    } else {
        console.log('call_busy')
    }
}



document.getElementById('phone_num').onkeypress = function(e){
    if (!e) e = window.event;
    var keyCode = e.code || e.key;
    if (keyCode == 'Enter'){
        document.getElementById('phone_num').value
        if (document.getElementById('start_call').disabled == true){
             Swal.fire({
              title: "Слишком короткий номер для вызова",
              text: 'Минимальный размер номера - 10 символов',
              icon: "error",
            });
        } else {
            click_to_call()
        }

      // Enter pressed
      return false;
    }
  }


function click_to_call(){
    console.log('out_extensions', out_extension)
    out_extension = ''
    out_base_fields = {}
    //Переписать под модель с кучей номеров
    if (out_extensions.length > 0){
        out_extension = out_extensions[0]['prefix']
    }


    if (call_section_dict[1] != false){
        vizov_btn = 'redirect'
        console.log('vizov_btn_2', vizov_btn)
    }
    //console.log(vizov_btn, out_extension)
    if (((out_extension != null) && (out_extension != undefined) && (out_extension != ''))||(vizov_btn=='redirect')){
        phone = document.getElementById('phone_num').value
        if (vizov_btn=='redirect'){
            socket_click.emit('click_to_call', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'phone':phone, 'out_extension':out_extension, 'call_type':vizov_btn, 'uuid':active_call_section_dict[1]['uuid']})
        } else {
            socket_click.emit('click_to_call', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'phone':phone, 'out_extension':out_extension, 'call_type':vizov_btn})
        }
    } else {
        Swal.fire({
          title: "Вам не назначена линия для исходящих вызовов",
          text: 'Обратитесь к администратору',
          icon: "error",
        });
    }
}


function out_project_click_to_call(){
    out_extension = ''
    //Переписать под модель с кучей номеров
    if (out_extensions.length > 0){
        out_extension = out_extensions[0]['prefix']
    }


    if ((out_extension != null) && (out_extension != undefined) && (out_extension != '')){
        phone = out_active_phone['phone']
        get_out_start = false
        socket_click.emit('get_out_start', {'fs_server':fs_server,  'room_id':room_id, 'worker':login, 'session_key':session_key, 'call_section':call_section, 'project_name':out_active_project_name, 'phone':phone, 'out_extension':out_extension, 'special_key':out_active_phone['special_key']})


    } else {
        out_preparation = false
        Swal.fire({
          title: "Для проекта "+all_projects[out_active_project_name]['glagol_name']+" не назначено ни одной линии.",
          text: 'Обратитесь к администратору',
          icon: "error",
        });
    }
}

document.getElementById('start_call').disabled = true
function phone_control(){

        sp_val = document.getElementById('phone_num').value;

        prestr = sp_val.replace(/\s+/g, '');
        str = prestr.toLowerCase();

        str = str.replace(/\D/g,'');

        document.getElementById('phone_num').value = str;
        if (str.length > 9){
            document.getElementById('start_call').disabled = false
        } else if ((call_section_dict[1] != false)||(call_section_dict[2] != false)||(call_section_dict[3] != false)){
            document.getElementById('start_call').disabled = false
        } else {
            document.getElementById('start_call').disabled = true
        }
}

m_status_dict = {
    'Available': {'text':'На линии', 'color':'success', 'button':'Перейти к обработке вызовов', 'dop':'logout'},
    'Available (On Demand)': {'text':'На линии (П.)', 'color':'success', 'button':'Перейти к обработке вызовов', 'dop':'logout'},
    'Logged Out': {'text':'Выключен', 'color':'danger', 'button':'Выйти на линию', 'dop':'no'},
    'On Break':  {'text':'Перерыв', 'color':'warning', 'button':'Выйти на линию', 'dop':'no'},
    'Post' : {'text':'Постобработка', 'color':'warning', 'button':'Перейти к обработке вызовов', 'dop':'logout'},
    }

m_sofia_status_dict = {
    'Registered': {'text':'Авторизован', 'color':'success'},
    'Unregistered': {'text':'Выключен', 'color':'secondary'},
}

m_state_dict = {
    'Waiting': {'text':'Готов', 'color':'success'},
    'Idle': {'text':'Постобработка', 'color':'warning'},
    'no':{'text':'', 'color':'light'},
    'In a queue call':{'text':'В разговоре', 'color':'secondary'},
    'Receiving': {'text':'Пришел вызов', 'color':'warning'}
}

function show_statuses(statuses){
    //console.log('STATUSES', fs_monitor_dict, statuses)

    for (sip_id in statuses){
        if (status_main_check == false){
            var status_main = make_html('div', ['status_main', sip_id], {'class':'row mx-0 my-0 px-0 py-0' }, '', 'connection_lines');
            status_main = status_main[1]
        } else {
            status_main = 'status_main_'+sip_id
        }

        status_line = statuses[sip_id]
        if (status_line['sofia_status'].includes('Registered')){
            status_line['sofia_status'] = 'Registered'
        }
        if (!(status_line['status'].includes('Available'))){
            status_line['state'] = 'no'
        }
        if ((status_line['sofia_status'] != 'Unregistered')||(status_line['status'] != 'Logged Out')){

            if (sip_id in fs_monitor_dict){
                status_id = 'status_' + sip_id
                state_id = 'state_' + sip_id
                sofia_status_id = 'sofia_status_' + sip_id

                status_place_id = 'status_place_' + sip_id
                state_place_id = 'state_place_' + sip_id
                sofia_status_place_id = 'sofia_status_place_' + sip_id
                //console.log(status_line['state'])
                document.getElementById(status_id).innerText = m_status_dict[status_line['status']]['text']
                document.getElementById(state_id).innerText = m_state_dict[status_line['state']]['text']
                document.getElementById(sofia_status_id).innerText = m_sofia_status_dict[status_line['sofia_status']]['text']

                butt_color = m_status_dict[status_line['status']]['color']
                document.getElementById(status_id).className = 'ml-2 mb-2 text text-'+butt_color
                document.getElementById(status_place_id).className = 'row border-right border-'+butt_color+' pr-2 mr-2 pl-1 my-1'

                butt_color = m_state_dict[status_line['state']]['color']
                document.getElementById(state_id).className = 'ml-2 mb-2 text text-'+butt_color
                document.getElementById(state_place_id).className = 'row border-right border-'+butt_color+' pr-2 mr-3 pl-1 my-1'

                butt_color = m_sofia_status_dict[status_line['sofia_status']]['color']
                document.getElementById(sofia_status_id).className = 'ml-2 mb-2 text text-'+butt_color
                document.getElementById(sofia_status_place_id).className = 'row border-right border-'+butt_color+' pr-2 mr-2 pl-1 my-1'

            } else {
                butt_color = 'info'
                var return_list = make_html('div', ['status_row', sip_id], {'class':'row border border-'+butt_color+' rounded my-1 ml-2 mr-2 call_line' }, '', status_main);
                call_id = return_list[1]

                var sip_place = make_html('div', ['sip_place', sip_id], {'class':'row border-right border-'+butt_color+' mr-2 pr-2 pl-1 my-1'}, '', call_id);
                var return_list = make_html('div', [], {'class':'col'}, '', sip_place[1]);
                sip_text = monitor_users[sip_id]['name']+' ('+sip_id+')'
                //sip_text = sip_id
                var return_list = make_html('p', ['sip', sip_id], {'class':'font-weight-bold mb-2', 'style':'margin-top: 5px;'}, sip_text, sip_place[1]);

                butt_color = m_sofia_status_dict[status_line['sofia_status']]['color']
                var sofia_status_place = make_html('div', ['sofia_status', 'place', sip_id], {'class':'row border-right border-'+butt_color+' pr-2 mr-2 pl-1 my-1'}, '', call_id);
                var return_list = make_html('p', ['sofia_status', sip_id], {'class':'ml-2 mb-2 text text-'+m_sofia_status_dict[status_line['sofia_status']]['color'], 'style':'margin-top: 5px;'}, m_sofia_status_dict[status_line['sofia_status']]['text'], sofia_status_place[1]);

                butt_color = m_status_dict[status_line['status']]['color']
                var status_place = make_html('div', ['status', 'place', sip_id], {'class':'row border-right border-'+butt_color+' pr-2 mr-2 pl-1 my-1'}, '', call_id);
                var return_list = make_html('p', ['status', sip_id], {'class':'ml-2 mb-2 text text-'+m_status_dict[status_line['status']]['color'], 'style':'margin-top: 5px;'}, m_status_dict[status_line['status']]['text'], status_place[1]);


                butt_color = m_state_dict[status_line['state']]['color']
                var state_place = make_html('div', ['state', 'place', sip_id], {'class':'row border-right border-'+butt_color+' pr-2 mr-3 pl-1 my-1'}, '', call_id);
                var return_list = make_html('p', ['state', sip_id], {'class':'ml-2 mb-2 text text-'+m_state_dict[status_line['state']]['color'], 'style':'margin-top: 5px;'}, m_state_dict[status_line['state']]['text'], state_place[1]);

                var project_place = make_html('div', ['project', 'place', sip_id], {'class':'row pr-2 mr-2 pl-1 mt-1 my-1 col'}, '', call_id);
                mm = 0

                for (cal_m in monitor_callcenter){
                    if (cal_m == sip_id){
                        call_line = monitor_callcenter[cal_m]
                        for (c_l in call_line){
                            line = call_line[c_l]
                            var return_list = make_html('button', ['project', mm, sip_id], {'class':'ml-1 btn btn-outline-info btn-sm py-1', 'style':'height:30px; margin-top:3px;'}, monitor_projects[line], project_place[1]);
                            mm = mm + 1

                        }
                    }
                }


            }
            fs_monitor_dict[sip_id] = status_line
        } else {
            if (sip_id in fs_monitor_dict){
              status_row = 'status_row_'+ sip_id
              document.getElementById(status_row).remove()
              delete fs_monitor_dict[sip_id]
            }
        }
    }
    status_main_check = true

}



function statuses_vis(){
    if (statuses_vis_s == false){
        $("#active_sips").fadeIn().show();
        statuses_vis_s = true
    } else {
        $("#active_sips").fadeOut(300);
        statuses_vis_s = false
    }
}



function dropper_change(prefix, f_n){
        dd_id_list = ['project_drop_down_list'];
        dd_id = list_combiner(dd_id_list)

        var div = document.getElementById(dd_id);
        var divs = div.getElementsByTagName('a');

        var s_text = document.getElementById('project_search').value;
        for (var i = 0; i < divs.length; i += 1) {
            paratext = divs[i].innerHTML
            paratext = paratext.toLowerCase()
            hash_field = '#'+divs[i].id+'_row'
            if ((paratext.includes(s_text.toLowerCase())) ||(s_text == '')) {
                $(hash_field).fadeIn().show();
            } else {
                $(hash_field).fadeOut(300);
            }

        }
}

function get_time_dif(time_to_parse){
    parsed_time = Date.parse(time_to_parse)
    var timeInMs = Date.now();
    var dif  = timeInMs - parsed_time;
    var b_Seconds_from_T1_to_T2 = dif / 1000;
    var b_Seconds_Between_Dates = Math.round(Math.abs(b_Seconds_from_T1_to_T2))
    return b_Seconds_Between_Dates
}

function removeItemAll(arr, value) {
  var i = 0;
  while (i < arr.length) {
    if (arr[i] === value) {
      arr.splice(i, 1);
    } else {
      ++i;
    }
  }
  return arr;
}

function show_script_questions(questions, categories){
    question_stats = {}
    question_search = {}
    cat_search = {}
    //console.log('++++++++++++++++++++')
    //console.log(questions)
    //console.log(categories)

    var return_list = make_html('input', ['script', 'search'], {'class':'form-control-lg input-sm ml-3 my-4 col-11', 'style':"border: 2px solid #11a5ed;", 'placeholder':'Найти вопрос',  'type':'text',
        'oninput':'search_script()'}, '', 'question_place');

    var no_place = make_html('div', ['cat_place', 'no'], {'class':'col-12 border-bottom border-secondary pb-3'}, '', 'question_place');
    cat_search['no'] = 0

    if (script_source != 'fs'){
        for (cat in categories){
            var cat_place = make_html('div', ['cat_place', cat], {'class':'col-12 border-bottom border-secondary pb-3'}, '', 'question_place');
            make_html('p', [], {'class':'text text-dark font-weight-bold mt-3', 'style':'font-size:25px;'}, categories[cat]['Name'], cat_place[1]);
            cat_search[cat] = 0
        }
        for (q_id in questions){
            question_search[q_id] = {'answer': questions[q_id]['Answer'], 'text': questions[q_id]['Text']}
            if (questions[q_id]['CategoryId'] != null) {
                cat_place = 'cat_place_'+questions[q_id]['CategoryId']
                cat_search[questions[q_id]['CategoryId']] += 1
                question_search[q_id]['category'] = categories[questions[q_id]['CategoryId']]['Name']
                question_search[q_id]['c_id'] = questions[q_id]['CategoryId']
            } else {
                cat_place = 'cat_place_no'
                question_search[q_id]['category'] = ''
                question_search[q_id]['c_id'] = 'no'
                cat_search['no'] += 1
            }
            make_html('button', ['q_text', q_id], {'class':'btn btn-outline-light text text-dark mr-2 mt-2', 'style':'font-size:15px;', 'onclick':'show_question('+q_id+')'}, questions[q_id]['Text'], cat_place);

            make_html('p', ['q_ans', q_id], {'class':'text text-dark ', 'style':'margin-top: 15px; font-size:20px;'}, questions[q_id]['Answer'], cat_place);
            question_stats[q_id] = false


            hash_q_row = '#q_ans_'+q_id
            $(hash_q_row).fadeOut(300);
         }
    } else {
        categories_ids = {}
        cat_id = 0
        for (q_id in questions){
            question_search[q_id] = {'answer': questions[q_id]['block_text'], 'text': questions[q_id]['block_name']}
            if (questions[q_id]['category'] != null) {
                if (!(questions[q_id]['category'] in categories_ids)){
                    categories_ids[questions[q_id]['category']] = cat_id


                    var cat_place = make_html('div', ['cat_place', cat_id], {'class':'col-12 border-bottom border-secondary pb-3'}, '', 'question_place');
                    make_html('p', [], {'class':'text text-dark font-weight-bold mt-3', 'style':'font-size:25px;'}, questions[q_id]['category'], cat_place[1]);
                    cat_search[cat_id] = 0
                    cat_id += 1
                }
                category_id = categories_ids[questions[q_id]['category']]
                cat_place = 'cat_place_'+category_id
                cat_search[category_id] += 1
                question_search[q_id]['category'] = questions[q_id]['category']
                question_search[q_id]['c_id'] = category_id
            } else {
                cat_place = 'cat_place_no'
                question_search[q_id]['category'] = ''
                question_search[q_id]['c_id'] = 'no'
                cat_search['no'] += 1
            }
            make_html('button', ['q_text', q_id], {'class':'btn btn-outline-light text text-dark mr-2 mt-2', 'style':'font-size:15px;', 'onclick':'show_question('+q_id+')'}, questions[q_id]['block_name'], cat_place);


            make_html('div', ['q_ans', q_id], {'style':'margin-top:15px;'}, '', cat_place);
            block_id = 'q_ans_'+ q_id
            make_editor_js(block_id, questions[q_id]['block_text'])

            question_stats[q_id] = false


            hash_q_row = '#q_ans_'+q_id
            $(hash_q_row).fadeOut(300);
         }
    }
}

function show_question(q_id){
   hash_q_row = '#q_ans_'+q_id
   if (question_stats[q_id] == false){
        $(hash_q_row).fadeIn().show();
        question_stats[q_id] = true
    } else {
        $(hash_q_row).fadeOut(300);
        question_stats[q_id] = false
    }
}


function search_script(){
    var s_text = document.getElementById("script_search").value;
    s_text = s_text.toLowerCase()
    cat_found = {}

    for (q_id in question_search){
        q_text = '#q_text_'+ q_id
            q_ans = '#q_ans_'+ q_id

        lower_text = question_search[q_id]['text'].toLowerCase()
        lower_answer = ''
        for (bbb in question_search[q_id]['answer']['blocks']){
            if (lower_answer != ''){
                lower_answer += ' '
            }

            lower_answer += question_search[q_id]['answer']['blocks'][bbb]['data']['text'].toLowerCase()
        }
        lower_category = question_search[q_id]['category'].toLowerCase()
        if ((lower_text.includes(s_text))||(lower_answer.includes(s_text))||(lower_category.includes(s_text))){
            cat_found[question_search[q_id]['c_id']] = true

            $(q_text).fadeIn().show();
            if (question_stats[q_id] == true){
                $(q_ans).fadeIn().show();
            }


        } else {
            $(q_text).fadeOut(300);
            $(q_ans).fadeOut(300);
        }
    }

    for (c_id in cat_search){
        cat_place = '#cat_place_'+ c_id
        if (c_id in cat_found){
            $(cat_place).fadeIn().show();
        } else {
            $(cat_place).fadeOut(300);
        }
    }

}


async function show_script_line(block_name, block_text, instructions, block_buttons){
    if (block_before == false){
        var block_place = make_html('div', ['block_place', block_count], {'class':'col-12 border-bottom border-secondary pb-3'}, '', 'replica_place');
    } else {
        var block_place = make_html('div', ['block_place', block_count], {'class':'col-12 border-bottom border-secondary pb-3'}, '', 'replica_place');
       // var block_place = make_html_before('div', ['block_place', block_count], {'class':'col-12 border-bottom border-secondary pb-3'}, '', 'replica_place', block_before);
    }
    block_before = block_place[0];
    //hash_block = '#'+block_before.id;
    //$(hash_block).attr('disabled', true);

    if (script_mode == 'forget'){
        try{
        prev_butts = block_count-1
        prev_butts = 'block_place_'+ prev_butts
        document.getElementById(prev_butts).remove()
        } catch {

        }
    } else {
        try{
            prev_butts = block_count-1
            prev_butts = 'block_butts_'+ prev_butts
            document.getElementById(prev_butts).remove()
        } catch {

        }
    }

    make_html('p', [], {'class':'text text-dark', 'style':'margin-top: 20px; font-size:15px;'}, block_name, block_place[1]);


    if (script_source != 'fs'){
    make_html('p', [], {'class':'text text-dark', 'style':'margin-top: 15px; font-size:20px;'}, block_text, block_place[1]);
    } else {
        make_html('div', ['editorjs', block_count], {}, '', block_place[1]);
        block_id = 'editorjs_'+ block_count
        make_editor_js(block_id, block_text)
    }



    instruct = make_html('div', ['instructions_place', block_count], {'class':'row col-12', 'style':'margin-top: 20px;'}, '', block_place[1]);
     //console.log('instructions', instructions)
     try{
        if (Object.keys(instructions).length == 0){
            instructions = null
        }
     } catch {

     }

     if (instructions != null){
        rr = make_html('div', ['i_place', block_count], {}, '', instruct[1]);

             if (script_source != 'fs'){
                var return_list = make_html('i', [], {'class':"fas fa-fw fa-exclamation-circle", 'style':'color: #11a5ed; margin-top: 5px;', 'title':'Инструкции'}, '', rr[1]);
                rr = make_html('div', ['i_p_place', block_count], {'class':'col pl-1'}, '', instruct[1]);
                make_html('p', [], {'class':'text text-dark ml-2', 'style':'margin-top: 1px; font-size:15px;'}, instructions, rr[1]);
             } else {
                var return_list = make_html('i', [], {'class':"fas fa-fw fa-exclamation-circle", 'style':'color: #11a5ed; margin-top: 10px;', 'title':'Инструкции'}, '', rr[1]);
                rr = make_html('div', ['i_p_place', block_count], {'class':'col pl-1'}, '', instruct[1]);
                make_html('div', ['editorjs_instructions', block_count], {}, '', rr[1]);
                block_id = 'editorjs_instructions_'+ block_count
                console.log('instructions', instructions)
                make_editor_js(block_id, instructions)
            }
        }

    block_butts = make_html('div', ['block_butts', block_count], {'class':'row col-12'}, '', block_place[1]);
    butt_colors = {0:'danger' , 1:'info', 2:'success', 3:'warning',4:'dark'}

    for (b_id in block_buttons){
        b_butt = block_buttons[b_id]
        if (butt_colors[b_butt['Keynote']] == 'warning'){
            make_html('button', [b_butt['BlockResultId'], block_count, 'butt'], {'class':'ml-2 mt-2 text text-dark btn btn-outline-'+butt_colors[b_butt['Keynote']], 'onclick':'next_script_move('+ b_butt['NextNumber'] +', '+ block_count+',"'+b_butt['Text']+'", "'+project_name+'", '+b_id+')'}, b_butt['Text'], block_butts[1]);

        } else {
            make_html('button', [b_butt['BlockResultId'], block_count, 'butt'], {'class':'ml-2 mt-2 btn btn-outline-'+butt_colors[b_butt['Keynote']], 'onclick':'next_script_move('+ b_butt['NextNumber'] +', '+ block_count+',"'+b_butt['Text']+'", "'+project_name+'", '+b_id+')'}, b_butt['Text'], block_butts[1]);
        }
    }

    result_comment = make_html('div', ['result_comment', block_count], {'class':'row col-12 mt-3'}, '', block_place[1]);

    block_hash = '#replica_place'
    //$(block_hash).scrollTop($(block_hash)[0].scrollHeight);
    $(block_hash).scrollTop($(block_hash)[0].scrollHeight);
    block_place[0].scrollIntoView({block: "end", behavior: "smooth"});
    await sleep(1000);
    $(block_hash).scrollTop(1000);
    block_place[0].scrollIntoView({block: "end", behavior: "smooth"});



    block_count += 1

}

function make_editor_js(block_id, block_text){
    var editor = new EditorJS({
          holderId: block_id,
          autofocus: true,
          tools: {
            header: {
              class: Header,
              inlineToolbar : true
            },
            Marker: {
              class: Marker,
              shortcut: 'CMD+SHIFT+M',
            },
            table: {
              class: Table,
              inlineToolbar: true,
              config: {
                rows: 2,
                cols: 3,
              },
            },
//            list: {
//              class: List,
//              inlineToolbar: true,
//              config: {
//                defaultStyle: 'unordered'
//              }
//            },
            delimiter:Delimiter,
           // paragraph:{
           //     class:Paragraph,
           //     inlineToolbar:true
           // },
            embed:Embed,

          },
          data: block_text,
          readOnly: true,
          minHeight : 0
        });
    return editor
}


function next_script_move(NextNumber, block_count, butt_text, project_name, result_id){
    if (NextNumber != 0){
        result_comment = 'result_comment_'+ block_count

        var myNode = document.getElementById(result_comment);
          while (myNode.firstChild) {
            myNode.removeChild(myNode.lastChild);
          }

        make_html('p', [], {'class':'text text-dark ml-2 mt-2 mr-4 font-weight-bold', 'style':'font-size:15px;'}, butt_text, result_comment);
        if (comment_mode == 'false'){
            move_direction = active_call_section_dict[1]['active_direction']
            if (move_direction == undefined){
                move_direction = script_dir

            }
            socket_click.emit('script_operations', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'script_id':script_id, 'source':script_source, 'action':'move_script', 'NextNumber':NextNumber, 'comment':'',
            'direction':move_direction, 'uuid':active_call_section_dict[1]['uuid'], 'b_uuid':active_call_section_dict[1]['b_uuid'], 'project_name':project_name, 'result_text':butt_text, 'result_id':result_id})
        } else {

            script_comment = make_html('div', ['script_comment_row'], {'class':'row'}, '', result_comment);

            make_html('input', ['script_comment_inp'], {'class':'form-control col ml-3', 'onchange':'save_comment_and_move('+NextNumber+', '+block_count+', "'+butt_text+'", "'+project_name+'", '+result_id+')'}, butt_text, script_comment[1]);
            document.getElementById('script_comment_inp').focus();
            document.getElementById('script_comment_inp').select();
            document.getElementById('phone_num').onkeypress = function(e){
                if (!e) e = window.event;
                var keyCode = e.code || e.key;
                if (keyCode == 'Enter'){
                    save_comment_and_move(NextNumber, block_count, butt_text)
                  return false;
                }
              }



        }
    } else {
        back()
    }
}


function save_comment_and_move(NextNumber, block_count, butt_text, project_name, result_id){
    if (NextNumber != 0){
        result_comment = 'result_comment_'+ block_count
        comment_text =  document.getElementById('script_comment_inp').value;
        var myNode = document.getElementById(result_comment);
          while (myNode.firstChild) {
            myNode.removeChild(myNode.lastChild);
          }
        make_html('p', [], {'class':'text text-dark ml-2 mt-2 mr-4 font-weight-bold', 'style':'font-size:15px;'}, butt_text + ' - '+comment_text, result_comment);
        socket_click.emit('script_operations', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'script_id':script_id, 'action':'move_script',  'source':script_source, 'NextNumber':NextNumber, 'comment':comment_text,
        'direction':active_call_section_dict[1]['active_direction'], 'uuid':active_call_section_dict[1]['uuid'], 'b_uuid':active_call_section_dict[1]['b_uuid'], 'project_name':project_name,
        'result_text':butt_text, 'result_id':result_id})

    } else {
        back()
    }
}



custom_filter = []

function dropper_choose(val, gname){
    event.preventDefault();
    event.stopPropagation();
    val_id = val
    while (val_id.includes('@')){
        val_id = val_id.replace('@', '_at_')
    }
    //console.log(fs_rep_line)
    var da_id_list = [val_id, 'project'];
    da_id = list_combiner(da_id_list)
    //console.log(da_id)
    if (custom_filter.includes(gname)){
        new_op = removeItemAll(custom_filter, gname)
        custom_filter = new_op
    } else {
        custom_filter.push(gname)
    }
    //console.log(custom_filter.includes(gname))

    if (custom_filter.includes(gname)){
        document.getElementById(da_id).className = "btn btn-outline-danger ml-2 col"
    } else {
        document.getElementById(da_id).className = "btn btn-outline-light text text-dark ml-2 col"
    }
    try {
        c_re = custom_filter.length
    } catch {
        c_re = 0
    }

    c_id = list_combiner(['project_butt', 'num'])
    document.getElementById(c_id).innerText = c_re
    sip_searcher()
}


function sip_searcher(){
    var s_text = document.getElementById("search_param").value;
    s_text = s_text.toLowerCase()

    for (sip_id in statuses){

        status_row = 'status_row_' + sip_id
        hash_status_row = '#' + status_row
        var div = document.getElementById(status_row);

        p_place = 'project_place_' + sip_id
        var p_div = document.getElementById(p_place);
        if (div != undefined){
            status_show = false

            if (s_text == ''){
                if (custom_filter.length == 0){
                    status_show = true
                } else {
                    var divs = p_div.getElementsByTagName('button');
                    var divArray = [];
                    for (var i = 0; i < divs.length; i += 1) {
                      inner = divs[i].innerText;
                      inner = inner.toLowerCase()

                        for (s_t in custom_filter){
                            i_text = custom_filter[s_t]
                            i_text = i_text.toLowerCase()
                            //console.log(inner, i_text)
                            if (inner.includes(i_text)){
                                status_show = true
                              }
                          }

                    }

                }

            } else {
                pre_status_show = false
                 if (custom_filter.length == 0){
                        pre_status_show = true
                } else {
                var divs = p_div.getElementsByTagName('button');
                var divArray = [];
                for (var i = 0; i < divs.length; i += 1) {
                  inner = divs[i].innerText;
                  inner = inner.toLowerCase()

                    for (s_t in custom_filter){
                        i_text = custom_filter[s_t]
                        i_text = i_text.toLowerCase()
                        //console.log(inner, i_text)
                        if (inner.includes(i_text)){
                            pre_status_show = true
                          }
                      }
                }
                }
                if (pre_status_show == true){
                    var divs = div.getElementsByTagName('p');
                    var divArray = [];
                    for (var i = 0; i < divs.length; i += 1) {
                      inner = divs[i].innerText;
                      inner = inner.toLowerCase()
                      if (inner.includes(s_text)){
                        status_show = true
                      }
                    }
                    var divs = div.getElementsByTagName('button');
                    var divArray = [];
                    for (var i = 0; i < divs.length; i += 1) {
                      inner = divs[i].innerText;
                      inner = inner.toLowerCase()
                      if (inner.includes(s_text)){
                        status_show = true
                      }
                    }
                }
            }
            if (status_show == true){
                $(hash_status_row).fadeIn().show();
            } else {
                $(hash_status_row).fadeOut(300);
            }
        }

    }

}



hash_field = '#online'
hash_logout = '#logout'
hash_pause = '#pause'
hash_start = '#start_call'
$(hash_field).fadeOut(300);
$(hash_logout).fadeOut(300);
$(hash_pause).fadeOut(300);
$(hash_start).fadeOut(300);
$("#active_sips").fadeOut(300);




socket_click.on('click_to_call_start', function (msg) {
    if (msg.result == 'ok'){
        if (out_active_project_name != ''){
            socket_click.emit('outbound_calls', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'project_pool':project_pool, 'action':'update_phone_to_call', 'assigned_key':assigned_key, 'log_status':'ringing', 'phone_status':'ringing', 'special_key':out_active_phone['special_key'], 'project_name':out_active_project_name})
        }
        call_initiation = false
        Swal.fire({
          title: "Звонок запускается",
          icon: "success",
          timer: 1000,

        });
    } else {
        if (out_active_project_name != ''){
            start_fs_with_reason('start_error', false)
            call_initiation = false
            socket_click.emit('outbound_calls', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'project_pool':project_pool, 'action':'update_phone_to_call', 'assigned_key':assigned_key, 'log_status':'error', 'phone_status':'error', 'special_key':out_active_phone['special_key'], 'project_name':out_active_project_name})
            out_active_phone = {}
            out_active_project_name = ''
            out_active_start_type = ''
            out_active_start = ''
            out_active_taken_reason = ''
            assigned_key = ''

        }

         Swal.fire({
          title: "Что-то пошло не так",
          text: 'Обратитесь к администратору',
          icon: "error",
        });
    }

});

socket_click.on('hold_toggle', function (msg) {
    Swal.fire({
      title: "ОК",
      icon: "success",
      timer: 1000,
    });
});

socket_click.on('uuid_break', function (msg) {
    Swal.fire({
      title: "ОК",
      icon: "success",
      timer: 1000,
    });
});

socket_click.on('uuid_bridge', function (msg) {
    Swal.fire({
      title: "ОК",
      icon: "success",
      timer: 1000,
    });
});

socket_click.on('data_saved', function (msg) {
    Swal.fire({
      title: "Данные сохранены",
      icon: "success",
    });
    get_out_calls()
    socket_click.emit('get_fs_report', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'level':(level-1)*onpage})


});



socket_click.on('fs_report', function (msg) {
    //console.log('-----!')
    show_fs_report(msg)

});

socket_click.on('fs_reasons', function (msg) {
    fs_reasons = msg.call_reasons
    fs_results = msg.call_results
    as_is_dict = msg.as_is_dict
    //console.log(fs_reasons)

});

socket_click.on('cc_fs_reasons', function (msg) {
    fs_reasons = msg.call_reasons
    fs_results = msg.call_results
    as_is_dict = msg.as_is_dict
    //console.log(fs_reasons)
    call_shower(call_id, active_call_section_dict[call_section]['active_caller_id'], active_call_section_dict[call_section]['active_datetime_start'], project_name, a_line_num, special_key_call, call_reason, call_result, user_comment, direction, '', call_section, {})

});

socket_click.on('get_phone_to_call', function (msg) {
   //if ((project_pool.length > 0) && ((active_call_section_dict[1]['uuid'] == ''||active_call_section_dict[1]['uuid'] == undefined)) &&(sofia == 'Registered') &&(fs_state == 'Waiting') &&((fs_status == 'Available')||(fs_status == 'Available (On Demand)')) && (call_initiation == false)  && (out_preparation == false)){
   out_active_phone = msg.phone
   out_active_project_name = msg.project_name
   out_active_start_type = msg.start_type
   out_active_start = msg.start
   out_active_taken_reason = msg.taken_reason

   out_extensions = msg.out_extensions
   console.log('out_extensions', out_extensions)
   assigned_key = msg.assigned_key
   out_preparation = true
    if (out_active_start_type == 'manual'){
        Swal.fire({
          title: 'Исходящий вызов - '+all_projects[out_active_project_name]['glagol_name'],
          text:'На номер '+out_active_phone['phone'],
          showCancelButton: true,
          confirmButtonText: 'Совершить',
          cancelButtonText: 'Отказаться',
          icon: "warning",
          timer: 20000,
          timerProgressBar: true,
        }).then((result) => {
          if (result.isConfirmed) {
            out_project_click_to_call()
            socket_click.emit('outbound_calls', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'project_pool':project_pool, 'action':'update_phone_to_call', 'assigned_key':assigned_key, 'log_status':'taken', 'phone_status':'taken', 'special_key':out_active_phone['special_key'], 'project_name':out_active_project_name})
          } else {
            change_state_fs('waiting', 'outbound_reject')
            out_preparation = false
            socket_click.emit('outbound_calls', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'project_pool':project_pool, 'action':'update_phone_to_call', 'assigned_key':assigned_key, 'log_status':'reject', 'phone_status':out_active_phone['status'], 'special_key':out_active_phone['special_key'], 'project_name':out_active_project_name})
          }
        })


    } else if (out_active_start_type == 'auto') {
        Swal.fire({
          title: 'Исходящий вызов - '+all_projects[out_active_project_name]['glagol_name'],
          text:'На номер '+out_active_phone['phone'],
          showConfirmButton: false,
          icon: "warning",
          timer: 3000,
          timerProgressBar: true,
        }).then((result) => {
            out_project_click_to_call()
            socket_click.emit('outbound_calls', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'project_pool':project_pool, 'action':'update_phone_to_call', 'assigned_key':assigned_key, 'log_status':'taken', 'phone_status':'taken', 'special_key':out_active_phone['special_key'], 'project_name':out_active_project_name})

        })

        }
    //}
});


socket_click.emit('monitor_fs', {'login':s_login,   'room_id':room_id, 'fs_server':fs_server, 'action':'get_projects'})


//socket_click.emit('get_fs_status', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server})
socket_click.on('fs_status', function (msg) {
//    socket_click.emit('status_refresh', {'room_id':room_id})
    fs_statuses_show(msg)
});

//refresh_id = setInterval(refreshTime, 1000);

//function refreshTime() {
//  ++refreshSeconds;
  //console.log(refreshSeconds)
//  if (refreshSeconds > 30){
//        clearInterval(refresh_id)
//      window.location.href = "/operator_online/";
//  }
//}

function arrayMin(array) {
  return array.reduce(function(a, b) {
    return Math.min(a, b);
  });
}
function MyMin(myarr){
    var al = myarr.length;
    minimum = myarr[al-1];
    while (al--){
        if(myarr[al] < minimum){
            minimum = myarr[al]
        }
    }
    return minimum;
};
socket_click.on('fs_calls', function (msg) {

    //refreshSeconds = 0
    msg_call_id = '0'
    //console.log(msg)

    console.log(call_section_dict)
    console.log(active_call_section_dict)
    console.log('-----------------------------')
    takens = []

    for (m in msg){
        msg_call_id = m
        call_secs = []
        call_section = false
        for (c_s in call_section_dict){
            //console.log(c_s, call_section_dict[c_s], call_section_dict[c_s] == false, call_section_dict[c_s] == msg[msg_call_id]['b_uuid'], call_section_dict[c_s] == msg[msg_call_id]['uuid'])
            if (((call_section_dict[c_s] == msg[msg_call_id]['b_uuid']) && (msg[msg_call_id]['b_uuid'] != '')) || ((call_section_dict[c_s] == msg[msg_call_id]['uuid']))&& (msg[msg_call_id]['uuid'] != '')) {
                call_section = c_s

            } else if (call_section_dict[c_s] == false) {
               call_secs.push(c_s)
            } else if (msg[msg_call_id] == undefined){
               call_secs.push(c_s)
            } else if (Object.keys(msg[msg_call_id]).length < 2){
               call_secs.push(c_s)

            }
        }
        if (call_section == false){
        //console.log(call_secs)
        call_section = MyMin(call_secs)
        }
        takens.push(call_section)
        //console.log(call_section)
        fs_call_shower(msg[msg_call_id], call_section)

    }
    //console.log('takens', takens)
    for (c_s in call_section_dict){
        if (call_section_dict[c_s] != false){
            //console.log(takens.includes(c_s))
            if (takens.includes(c_s) == true){
            } else {
                fs_call_shower({}, c_s)
            }
        }
    }



});

socket_click.on('fs_report_line', function (msg) {
    //console.log('fs_report_line')
    msg_call_id = '0'
    for (m in msg){
        msg_call_id = m
        //console.log('over_call',msg_call_id, msg[msg_call_id])

        for (c_s in call_section_dict){
            if ((call_section_dict[c_s] == msg[msg_call_id]['b_uuid']) || (call_section_dict[c_s] == msg[msg_call_id]['uuid'])) {
                call_section = c_s

            }
        }

        inner_call_section = msg.call_section
        console.log(inner_call_section)
        over_call(msg[msg_call_id], call_section)
    }

});

socket_click.on('fs_report_line_cs', function (msg) {
    //console.log('fs_report_line')
    msg_call_id = '0'
    for (m in msg.report){
        msg_call_id = m
        //console.log('over_call',msg_call_id, msg[msg_call_id])

        for (c_s in call_section_dict){
            if ((call_section_dict[c_s] == msg.report[msg_call_id]['b_uuid']) || (call_section_dict[c_s] == msg.report[msg_call_id]['uuid'])) {
                call_section = c_s

            }
        }

        inner_call_section = msg.call_section
        console.log(inner_call_section)
        over_call(msg.report[msg_call_id], inner_call_section)
    }

});



socket_click.on('fs_count', function (msg) {
    //console.log('fs_count')
    paginator(msg['count'])
});



socket_click.on('get_out_start', function (msg) {
    out_base_fields = {}
    phone_line = msg.phone_line
    //out_extensions = msg.out_extensions
    //console.log('out_extensions_start', out_extensions)
    phone = msg.phone
    out_extension = msg.out_extension
    out_active_project_name = msg.project_name
    if (phone_line.length > 0){
        out_base_fields = phone_line[0]['contact_info']
    }
    //console.log('----------',out_base_fields)
    get_out_start = true
    call_initiation = true
    out_preparation = false
    socket_click.emit('click_to_call', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'phone':phone, 'out_extension':out_extension, 'call_type':vizov_btn, 'project_name':out_active_project_name})

    module_shower(out_active_project_name)
});

socket_click.on('fs_dia_des', function (msg) {

    call_shower_finished = false

    dia_dest = msg
    console.log('dia_dest', dia_dest)
    dest_project = undefined
    dia_project = undefined
    phone_line = msg.phone_line
    project_name = ''
    if (call_section == 1){
        modules_before = []
        modules_after = []
        out_extensions = msg.out_extensions
    }
    if (Object.keys(dia_dest['destination_numbers']).length > 0){
        dest_project = dia_dest['destination_numbers'][0]['project_name']

    }
    if (Object.keys(dia_dest['diaplan']).length > 0){
        dia_project = dia_dest['diaplan'][0]['project_name']
    }
    //if (dia_project != undefined){
    //    project_name = dia_project

    //} else if (dest_project != undefined){
    //    project_name = dest_project
    //}
    if (out_active_project_name == ''){
        project_name = msg.project_name
    } else {
        project_name = out_active_project_name
    }
    console.log('call_section', call_section)
    if (call_section== 1) {
        //console.log('project_name', project_name)
        //script_shower(project_name)
        module_shower(project_name)
    }

    console.log('project_name', project_name)

    console.log('after_dia_dest', dia_dest)
    a_line_num = ''
    special_key_call = call_section_dict[call_section]
    console.log('got_dia_dest', call_section)
    call_reason = ''
    call_result = ''
    user_comment = ''
    call_id = 'active'
    base_fields = {}
    if (phone_line.length > 0){
        base_fields = phone_line[0]['contact_info']
    }
    console.log('----------phone_line', phone_line)
    if ((call_section != undefined) && (project_name != undefined)){
        call_shower(call_id, active_call_section_dict[call_section]['active_caller_id'], active_call_section_dict[call_section]['active_datetime_start'], project_name, a_line_num, special_key_call, call_reason, call_result, user_comment, 'inbound', '', msg.call_section, base_fields)
        //if (modules_before.length > 0){
        //    for (m_id in modules_before){
        //        mo_line = modules_before[m_id]
        //        module_run(mo_line[0], mo_line[1], mo_line[2], mo_line[3])
        //        console.log('module_run', mo_line[0], mo_line[1], mo_line[2], mo_line[3])
        //    }
        //}

    }
});

socket_click.on('other_users', function (msg) {
    statuses = msg.statuses
    show_statuses(statuses)
});

socket_click.on('get_break', function (msg) {
    break_table = msg.table
    break_table = break_table[0]
    get_type = msg.get_type
    break_status = break_table['changed_dt']
    break_reason = break_table['reason']
    try{
        document.getElementById('status').innerText = break_reasons[break_reason]['text']
    }   catch {
        document.getElementById('status').innerText = "Принудительный - ошибка"
    }

    document.getElementById('status').className = "font-weight-bold mb-1 text text-"+fs_stat_dict['On Break']['color'];


            time_to_parse = break_status
            b_Seconds_Between_Dates = get_time_dif(time_to_parse)
            //console.log(Seconds_Between_Dates)
            //console.log('get_break', get_type, b_totalSeconds, b_Seconds_Between_Dates)
            b_totalSeconds = b_Seconds_Between_Dates;

            if (get_type == 'new'){
            var return_list = make_html('div', ['time_row'], {'class':'row col-12'}, '', 'time_place');
            var ret = make_html('p', [], {'class':'mx-1 mb-1 font-weight-bold text text-'+fs_stat_dict['On Break']['color']}, '(', return_list[1]);
            var ret = make_html('label', ['b_hours'], {'class':'mb-1 font-weight-bold text text-'+fs_stat_dict['On Break']['color']}, '00', return_list[1]);
            var ret = make_html('p', ['b_dots_h'], {'class':'mx-1 mb-1 font-weight-bold text text-'+fs_stat_dict['On Break']['color']}, ':', return_list[1]);
            var ret = make_html('label', ['b_minutes'], {'class':'mb-1 font-weight-bold text text-'+fs_stat_dict['On Break']['color']}, '00', return_list[1]);
            var ret = make_html('p', ['b_dots'], {'class':'mx-1 mb-1 font-weight-bold text text-'+fs_stat_dict['On Break']['color']}, ':', return_list[1]);
            var ret = make_html('label', ['b_seconds'], {'class':'mb-1 font-weight-bold text text-'+fs_stat_dict['On Break']['color']}, '00', return_list[1]);
            var ret = make_html('p', [], {'class':'mx-1 mb-1 font-weight-bold text text-'+fs_stat_dict['On Break']['color']}, ')', return_list[1]);

            var b_minutesLabel = document.getElementById("b_minutes");
            var b_secondsLabel = document.getElementById("b_seconds");
            var b_hoursLabel = document.getElementById("b_hours");

            b_interval_id = setInterval(setTime, 1000);
            }
            function setTime() {
              b_totalSeconds = get_time_dif(time_to_parse)


              var hours = Math.floor(b_totalSeconds / 3600);

              b_l_totalSeconds = b_totalSeconds - hours * 3600;

              var minutes = Math.floor(b_l_totalSeconds / 60);

              var seconds = b_l_totalSeconds - minutes * 60;

              b_secondsLabel.innerHTML = b_pad(seconds);
              b_minutesLabel.innerHTML = b_pad(minutes);
              b_hoursLabel.innerHTML = b_pad(hours);

              //if (b_totalSeconds%100 == 0){
              //  socket_click.emit('get_break', {'fs_server':fs_server, 'sip_login':sip_login, 'room_id':room_id, 'worker':login, 'session_key':session_key, 'get_type':'old'})
              //  console.log('get_old')
              //}

            }

            function b_pad(val) {
              var valString = val + "";
              if (valString.length < 2) {
                return "0" + valString;
              } else {
                return valString;
              }
            }

});


socket_click.on('start_script', function (msg) {


    var myNode = document.getElementById("replica_place");
      while (myNode.firstChild) {
        myNode.removeChild(myNode.lastChild);
      }
    var myNode = document.getElementById("question_place");
      while (myNode.firstChild) {
        myNode.removeChild(myNode.lastChild);
      }

    script_id = msg.script_id
    console.log('start_script', script_id )
    if (script_id != ''){

         $('#report_place').fadeOut(300);
         $('#script_place').fadeIn().show();
        script_mode = msg.script_mode
        comment_mode = msg.comment_mode
        script_source = msg.source
        block_name = msg.block_name
        block_text = msg.block_text
        instructions = msg.instructions
        block_buttons = msg.block_buttons

        questions = msg.questions
        categories = msg.categories
        project_name = msg.project_name

        show_script_questions(questions, categories)
        //console.log('questions', questions.length)
        if (Object.keys(questions).length == 0){
            $("#question_place").fadeOut(300);
            document.getElementById('replica_box').style.height = '650px'
        } else {
            $("#question_place").fadeIn().show();
            document.getElementById('replica_box').style.height = '450px'
        }
        show_script_line(block_name, block_text, instructions, block_buttons, project_name)
    }
});

socket_click.on('move_script', function (msg) {



    block_name = msg.block_name
    block_text = msg.block_text
    instructions = msg.instructions
    block_buttons = msg.block_buttons
    project_name = msg.project_name

    show_script_line(block_name, block_text, instructions, block_buttons, project_name)
});

async function sleep(ms) {

    await new Promise(r => setTimeout(r, ms));
}

socket_click.on('get_modules', function (msg) {

    pre_active_modules = msg.modules

    active_modules = []
    while (pre_active_modules.length > 0){
        min_id = undefined
        min_act = 0
        for (pre_act in pre_active_modules){
            pre_module = pre_active_modules[pre_act]
            if (min_id == undefined){
                min_id = pre_module['id']
                min_act = pre_act
            } else if (min_id > pre_module['id']){
                min_id = pre_module['id']
                min_act = pre_act
            }
        }
        active_modules.push(pre_active_modules[min_act])
        pre_active_modules.splice(min_act, 1)

    }

    project_name = msg.project_name
    //console.log('active_modules', active_modules)

    active_modules_dict = {}
    var myNode = document.getElementById("module_place");
      while (myNode.firstChild) {
        myNode.removeChild(myNode.lastChild);
      }
    manual_show = false
    modules_after = []
    modules_before = []
    if (active_modules.length > 0){
        console.log('active_modules', active_modules)
        for (a_id in active_modules){
            mod_line = active_modules[a_id]
            active_modules_dict[mod_line['name']] = mod_line

            if (mod_line['start_modes'][project_name] == 'manual'){
                make_html('button', ['module', a_id], {'class':'btn btn-outline-success my-1 ml-2 py-1', 'onclick':'module_run("'+mod_line['name']+'", "'+a_id+'", "'+project_name+'", "manual", "no")'}, mod_line['name'], 'module_place');
                manual_show = true
            } else if (mod_line['start_modes'][project_name] == 'start'){
                while (call_shower_finished == false){
                    sleep(500)
                    //console.log('wait')
                }
                if (call_shower_finished == true){

                    //console.log(mod_line['name'], "no", project_name, "start")
                    module_run(mod_line['name'], "no", project_name, "start", 'no')
                }


            } else if (mod_line['start_modes'][project_name] == 'after') {
                modules_after.push([mod_line['name'], "no", project_name, "after"])
            }

        }
    }
    //console.log('modules_after', modules_after)
    if (manual_show == true){
        $("#module_butts").fadeIn().show();
    } else {
        $("#module_butts").fadeOut(300);
    }

});

function module_run(module_name, ma_id, project_name, run_mode, c_s){

    if (ma_id != 'no'){
        document.getElementById('module_'+ma_id).disabled = true
    }
    module_line = active_modules_dict[module_name]
    inputs = module_line['inputs']

    if (run_mode != 'after'){
        c_s = 1
    }
    r_uuid = active_call_section_dict[1]['uuid']
    if (r_uuid == undefined){
        r_uuid = active_fs_report_line['special_key_conn']
    }
    r_b_uuid = active_call_section_dict[1]['buuid']
    if (r_b_uuid == undefined){
        r_b_uuid = ''
    }
    send_them_all = {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server, 'action':'run_module',
    'name___n':module_name, 'project_name':project_name, 'uuid':r_uuid, 'b_uuid':r_b_uuid, 'run_mode':run_mode, 'ma_id':ma_id, 'c_s':c_s}
    as_is_module = {}

    if ((call_section_dict[c_s] == false)&&(post_call_section_dict[c_s] != true)){
        call_adr = active_call_id

    } else {
        call_adr = 'active'

    }


    if (Object.keys(as_is_filled).length > 0){
        for (as_id in as_is_filled){
            if ((as_is_filled[as_id]['field_type'] != 'many') && (as_is_filled[as_id]['field_type'] != 'non_editable')){
                as_is_module[as_id] = document.getElementById(as_is_filled[as_id]['field_id']).value


            } else if (as_is_filled[as_id]['field_type'] == 'many') {
                many_text = ''
                for (man in as_is_filled[as_id]['field_id']){
                    if (document.getElementById(as_is_filled[as_id]['field_id'][man]).checked == true){
                        if (many_text.length > 0){
                            many_text += ', '
                        }
                        many_text += man
                    }
                }
                as_is_module[as_id] = many_text
            } else if (as_is_filled[as_id]['field_type'] == 'non_editable'){
                as_is_module[as_id] = document.getElementById(as_is_filled[as_id]['field_id']).innerText
            }

        }
    }
    //console.log('as_is_module', as_is_module)

    to_parse = ''
    //console.log('reason', call_adr, call_section)
    //console.log(call_adr, active_fs_report_line)
    for (input in inputs){
        i_val = inputs[input][project_name]

        try{
        if (i_val in as_is_module){
            send_them_all[input] = as_is_module[i_val]
        } else if (i_val == 'operator_id') {
            send_them_all[input] = sip_login
        } else if (i_val == 'reason') {
            //send_them_all[input] = document.getElementById('cs_reason_'+ call_adr+'_'+call_section).value
            hash_ii = '#cs_reason_'+ call_adr+'_'+1
            send_them_all[input] = $(hash_ii).children(':selected').text();
        } else if (i_val == 'result') {
            //send_them_all[input] = document.getElementById('cs_result_'+ call_adr+'_'+call_section).value
            hash_ii = '#cs_result_'+ call_adr+'_'+1
            send_them_all[input] = $(hash_ii).children(':selected').text();
        } else if (i_val == 'phone') {
            if (call_adr == 'active'){
                send_them_all[input] = active_caller_id
            } else {
                send_them_all[input] = shower_caller_id
            }

         } else if (i_val == 'comment') {
            send_them_all[input] = document.getElementById('cs_textar_'+ call_adr+'_'+1).value
        } else if (i_val == 'uuid') {
            if (call_adr != 'active'){
                send_them_all[input] = active_fs_report_line['special_key_conn']
            } else {
                send_them_all[input] = active_call_section_dict[1]['uuid']
            }
        } else if (i_val == 'b_uuid') {
            if (active_call_section_dict[1]['b_uuid'] != undefined){
                send_them_all[input] = active_call_section_dict[1]['b_uuid']
            } else {
                send_them_all[input] = ''
            }

        } else if (i_val == 'datetime_start') {

            if (call_adr == 'active'){
                try {
                    send_them_all[input] = active_call_section_dict[1]['datetime_start']
                } catch {
                    send_them_all[input] = undefined
                }
                if (send_them_all[input] == undefined){
                    send_them_all[input] = active_call_section_dict[1]['active_datetime_start']
                }
            } else {

                send_them_all[input] = active_fs_report_line['datetime_start']
            }


        } else if (i_val == 'datetime_end') {
            if (call_adr == 'active'){
                try {
                    send_them_all[input] = active_call_section_dict[1]['datetime_end']
                } catch {
                    send_them_all[input] = undefined
                }
                if (send_them_all[input] == undefined){
                    send_them_all[input] = ''
                }
            } else {
                send_them_all[input] = active_fs_report_line['datetime_end']
            }
        } else if (i_val == 'dest') {
            if (call_adr == 'active'){
                send_them_all[input] = active_call_section_dict[1]['dest']
            } else {
               send_them_all[input] = active_fs_report_line['destination_id']
            }
        } else if (i_val == 'cid_num') {
            if (call_adr == 'active'){
                send_them_all[input] = active_call_section_dict[1]['cid_num']

            } else {
               send_them_all[input] = active_fs_report_line['caller_id']
            }

        } else {
            send_them_all[input] = i_val
        }
        } catch {
            send_them_all[input] = 'error'
        }

        if (to_parse != ''){
            to_parse += ','
        }
        to_parse += input
    }

    send_them_all['to_parse'] = to_parse
    //console.log('send_them_all', send_them_all)
    socket_click.emit('module_operations', send_them_all)
}


socket_click.on('run_module', function (msg) {
    module_return = msg.module_return
    module_line = active_modules_dict[msg.module_name]
    outputs = module_line['outputs']
    //console.log('module_return', as_is_filled)
    if (msg.ma_id != 'no'){
        document.getElementById('module_'+msg.ma_id).disabled = false
    }

    Swal.fire({
      title: "Успех",
      text: 'Результат работы модуля передан в систему',
      icon: "success",
    });
    if ((call_section_dict[1] == false)&&(post_call_section_dict[1] != true)){
        call_adr = active_call_id

    } else {
        call_adr = 'active'

    }

    if (Object.keys(as_is_filled).length > 0){
        for (as_id in as_is_filled){

            for (out in outputs){
                o_place = outputs[out][project_name]
                //console.log(o_place, as_id)
                if (o_place == as_id){
                    if ((as_is_filled[as_id]['field_type'] != 'many') && (as_is_filled[as_id]['field_type'] != 'non_editable') && (as_is_filled[as_id]['field_type'] != 'select')){

                        document.getElementById(as_is_filled[as_id]['field_id']).value = module_return[out]
                    } else if (as_is_filled[as_id]['field_type'] == 'select') {

                        var $selectt = $(document.getElementById(as_is_filled[as_id]['field_id']));
                        var selectized = $selectt[0].selectize;

                        if (module_return[out].includes('|_|_|')){
                            n_splitted  = module_return[out].split('|_|_|');
                            for (nnn in n_splitted){
                                n_vall = n_splitted[nnn]
                                selectized.addOption({value: n_vall, text: n_vall});
                            }
                            selectized.refreshOptions();
                        } else {
                            selectized.setValue(module_return[out], false)
                        }




                    } else if (as_is_filled[as_id]['field_type'] == 'many') {
                        many_text = ''
                        for (man in as_is_filled[as_id]['field_id']){
                            if (module_return[out].includes(man)){
                                document.getElementById(as_is_filled[as_id]['field_id'][man]).checked = true
                            } else {
                                document.getElementById(as_is_filled[as_id]['field_id'][man]).checked == false
                            }
                        }
                        as_is_module[as_id] = many_text
                    } else if (as_is_filled[as_id]['field_type'] == 'non_editable'){
                        document.getElementById(as_is_filled[as_id]['field_id']).innerText = module_return[out]
                    }
                    break;
                } else if (o_place == 'reason') {
                    document.getElementById('cs_reason_'+ call_adr+'_'+call_section).value = module_return[out]
                } else if (o_place == 'result') {
                    document.getElementById('cs_result_'+ call_adr+'_'+call_section).value = module_return[out]
                }

        }
    }
    }
    if (msg.run_mode == 'after'){
        after_finish += 1
        //console.log('after_finish + 1')
    }
});




socket_click.on('get_callcenter_queues', function (msg) {
    project_name = msg.project_name
    console.log('cc_project_name', project_name)
    got_callcenter_queues = true
    if (project_name != ''){
        script_shower(project_name)
    }

})


socket_click.on('monitor_projects', function (msg) {

    projects = msg.projects
    callcenter = msg.callcenter
    users = msg.users


    for (us in users){
        user_line = users[us]
        monitor_users[user_line['login']] = user_line
    }
    monitor_projects = {}
    all_projects = {}
    for (pro in projects){
        pro_line = projects[pro]
        monitor_projects[pro_line['project_name']] = pro_line['glagol_name']
        all_projects[pro_line['project_name']] = pro_line
    }



    for (pro in callcenter){
        pro_line = callcenter[pro]
        if (pro_line['agent_name'] in monitor_callcenter){
            if (!(monitor_callcenter[pro_line['agent_name']].includes(pro_line['project_name']))){
                monitor_callcenter[pro_line['agent_name']].push(pro_line['project_name'])
            }
        } else {
            monitor_callcenter[pro_line['agent_name']] = [pro_line['project_name']]
        }
    }


    var bg_id_list = ['project_group'];
        var bg_params_dict = {};
        var return_list = make_html('div', bg_id_list, bg_params_dict, '', 'monitor_group');
        var bg_div_id = return_list[1];
        var ru_params_dict = {
            "type":"button",
            "class":'btn btn-outline-light mr-2 mt-0 ml-3 text text-dark',
            "data-toggle":"dropdown",
            "aria-expanded":"false",
            'style':'width:220px'
        };

        var return_list = make_html('button', ['project_butt'], ru_params_dict, '', return_list[1]);
        make_html('div', ['p_num_place'], {'class':'row col-12 mb-0 mx-0'}, '', return_list[1]);
        make_html('p', [], {'class':'mb-0'}, 'Фильтр по проектам', 'p_num_place');
        make_html('p', ['project_butt', 'num'], {'class':'text text-bold ml-1 mb-0'}, '', 'p_num_place');
        var ru_div_id = return_list[1];

        var dd_id_list = ['project_drop_down_list'];
        var dd_params_dict = {
            "class":"dropdown-menu dropper_box",
            "aria-labelledby":ru_div_id,
            'style':'width:300px',
        };
        var return_list = make_html('div', dd_id_list, dd_params_dict, '', bg_div_id);
        var dd_div_id = return_list[1];

        var return_list = make_html('input', ['project', 'search'], {'class':'form-control input-sm ml-3 mr-2 my-2', 'style':'max-width:250px', 'type':'text',
        'oninput':'dropper_change()'}, '', dd_div_id);


        for (v in projects){
            fs_rep_line = projects[v]
            val = fs_rep_line['project_name']
            val_id = val
            while (val_id.includes('@')){
                val_id = val_id.replace('@', '_at_')
            }
            //console.log(fs_rep_line)
            var da_id_list = [val_id, 'project'];
            var d_type = 'head';
            var ru_id_onclic = function_combiner('dropper_choose', [val, fs_rep_line['glagol_name']]);

            var da_params_dict = {
                "href":"",
            };
            da_params_dict['class'] = "btn btn-outline-light text text-dark ml-2 col";
            da_params_dict['onclick'] = ru_id_onclic;
            var retur = make_html('div', [val_id, 'project', 'row'], {'class':'row col-12 my-1 pl-4 pr-2'}, '', dd_div_id);
            var return_list = make_html('a', da_id_list, da_params_dict, fs_rep_line['glagol_name'], retur[1]);
            var da_div_id = return_list[1];
        }


    refresh_id = setInterval(refreshTime, 3000);
    socket_click.emit('get_fs_status_once', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server})
    first_run = true
    function refreshTime() {
      ++refreshSeconds;
      socket_click.emit('get_fs_status_once', {'worker':login, 'sip_login':sip_login, 'session_key':session_key, 'room_id':room_id, 'fs_server':fs_server})
      if (first_run == true){
        get_out_calls()
      }
      first_run = false
    }

    refresh_out_id = setInterval(refreshOut, 30000);
    function refreshOut() {
      ++refreshSeconds;
      get_out_calls()
    }
});

$("#call_section_1").fadeOut(300);
$("#call_section_2").fadeOut(300);
$("#call_section_3").fadeOut(300);
$("#module_butts").fadeOut(300);

make_html('p', [], {'class':'mt-0 mb-1'}, 'Вер. '+vers, 'ver_place');
