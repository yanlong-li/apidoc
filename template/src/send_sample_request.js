import $ from 'jquery';
import { convertPathParams, handleNestedAndParsingFields, tryParsingWithTypes } from './send_sample_request_utils.js';

export function initSampleRequest () {
  // Button send
  $('.sample-request-send').off('click');
  $('.sample-request-send').on('click', function (e) {
    e.preventDefault();
    const $root = $(this).parents('article');
    const group = $root.data('group');
    const name = $root.data('name');
    const version = $root.data('version');
    sendSampleRequest(group, name, version, $(this).data('sample-request-type'));
  });

  // Button clear
  $('.sample-request-clear').off('click');
  $('.sample-request-clear').on('click', function (e) {
    e.preventDefault();
    const $root = $(this).parents('article');
    const group = $root.data('group');
    const name = $root.data('name');
    const version = $root.data('version');
    clearSampleRequest(group, name, version);
  });
}

function sendSampleRequest (group, name, version, type) {
  const $root = $('article[data-group="' + group + '"][data-name="' + name + '"][data-version="' + version + '"]');

  // Optional header
  const header = {};
  $root.find('.sample-request-header:checked').each(function (i, element) {
    const group = $(element).data('sample-request-header-group-id');
    $root.find('[data-sample-request-header-group="' + group + '"]').each(function (i, element) {
      const key = $(element).data('sample-request-header-name');
      let value = element.value;
      if (typeof element.optional === 'undefined') {
        element.optional = true;
      }
      if (!element.optional && element.defaultValue !== '') {
        value = element.defaultValue;
      }
      header[key] = value;
    });
  });

  // create JSON dictionary of parameters
  let param = {};
  const paramType = {};
  const bodyFormData = new FormData();
  let bodyJson = '';
  $root.find('.sample-request-param:checked').each(function (i, element) {
    const group = $(element).data('sample-request-param-group-id');
    const contentType = $(element).nextAll('.sample-header-content-type-switch').first().val();
    if (contentType === 'body-json') {
      $root.find('[data-sample-request-body-group="' + group + '"]').not(function () {
        return $(this).val() === '' && $(this).is('[data-sample-request-param-optional=\'true\']');
      }).each(function (i, element) {
        if (isJson(element.value)) {
          header['Content-Type'] = 'application/json';
          bodyJson = element.value;
        }
      });
    } else {
      $root.find('[data-sample-request-param-group="' + group + '"]').not(function () {
        return $(this).val() === '' && $(this).is('[data-sample-request-param-optional=\'true\']');
      }).each(function (i, element) {
        const key = $(element).data('sample-request-param-name');
        let value = element.value;
        if (!element.optional && element.defaultValue !== '') {
          value = element.defaultValue;
        }
        if (contentType === 'body-form-data') {
          header['Content-Type'] = 'multipart/form-data';
          if (element.type === 'file') {
            value = element.files[0];
          }
          bodyFormData.append(key, value);
        } else {
          param[key] = value;
          paramType[key] = $(element).next().text();
        }
      });
    }
  });

  // grab user-inputted URL
  let url = $root.find('.sample-request-url').val();

  // Convert {param} form to :param
  url = convertPathParams(url);

  // Insert url parameter
  const pattern = pathToRegexp(url, null); // eslint-disable-line no-undef
  const matches = pattern.exec(url);
  for (let i = 1; i < matches.length; i++) {
    let key = matches[i].substr(1);
    let optional = false;
    if (key[key.length - 1] === '?') {
      optional = true;
      key = key.substr(0, key.length - 1);
    }
    if (param[key] !== undefined) {
      url = url.replace(matches[i], encodeURIComponent(param[key]));

      // remove URL parameters from list
      delete param[key];
    } else if (optional) {
      // if parameter is optional denoted by ending '?' in param (:param?)
      // and no parameter is given, replace parameter with empty string instead
      url = url.replace(matches[i], '');
      delete param[key];
    }
  } // for

  // handle nested objects and parsing fields
  param = handleNestedAndParsingFields(param, paramType);

  // add url search parameter
  if (header['Content-Type'] === 'application/json') {
    if (bodyJson) {
      // bodyJson is set to value if request body: 'body/json' was selected and manual json was input
      // in this case, use the given bodyJson and add other params in query string
      url = url + encodeSearchParams(param);
      param = bodyJson;
    } else {
      // bodyJson not set, but Content-Type: application/json header was set. In this case, send parameters
      // as JSON body. First, try parsing fields of object with given paramType definition so that the json
      // is valid against the parameter spec (e.g. Boolean params are boolean instead of strings in final json)
      param = tryParsingWithTypes(param, paramType);
      param = JSON.stringify(param);
    }
  } else if (header['Content-Type'] === 'multipart/form-data') {
    url = url + encodeSearchParams(param);
    param = bodyFormData;
  }

  $root.find('.sample-request-response').fadeTo(250, 1);
  $root.find('.sample-request-response-json').html('Loading...');
  refreshScrollSpy();

  // send AJAX request, catch success or error callback
  const ajaxRequest = {
    url: url,
    headers: header,
    data: param,
    type: type.toUpperCase(),
    success: displaySuccess,
    error: displayError,
  };

  if (header['Content-Type'] === 'multipart/form-data') {
    delete ajaxRequest.headers['Content-Type'];
    ajaxRequest.contentType = false;
    ajaxRequest.processData = false;
  }
  $.ajax(ajaxRequest);

  function displaySuccess (data, status, jqXHR) {
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(jqXHR.responseText);
      jsonResponse = JSON.stringify(jsonResponse, null, 4);
    } catch (e) {
      jsonResponse = jqXHR.responseText;
    }
    $root.find('.sample-request-response-json').text(jsonResponse);
    refreshScrollSpy();
  }

  function displayError (jqXHR, textStatus, error) {
    let message = 'Error ' + jqXHR.status + ': ' + error;
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(jqXHR.responseText);
      jsonResponse = JSON.stringify(jsonResponse, null, 4);
    } catch (e) {
      jsonResponse = jqXHR.responseText;
    }

    if (jsonResponse) { message += '\n' + jsonResponse; }

    // flicker on previous error to make clear that there is a new response
    if ($root.find('.sample-request-response').is(':visible')) { $root.find('.sample-request-response').fadeTo(1, 0.1); }

    $root.find('.sample-request-response').fadeTo(250, 1);
    $root.find('.sample-request-response-json').text(message);
    refreshScrollSpy();
  }
}

function clearSampleRequest (group, name, version) {
  const $root = $('article[data-group="' + group + '"][data-name="' + name + '"][data-version="' + version + '"]');

  // hide sample response
  $root.find('.sample-request-response-json').html('');
  $root.find('.sample-request-response').hide();

  // reset value of parameters
  $root.find('.sample-request-param').each(function (i, element) {
    element.value = '';
  });

  // restore default URL
  const $urlElement = $root.find('.sample-request-url');
  $urlElement.val($urlElement.prop('defaultValue'));

  refreshScrollSpy();
}

function refreshScrollSpy () {
  $('[data-spy="scroll"]').each(function () {
    $(this).scrollspy('refresh');
  });
}

/**
   * is Json
   */
function isJson (str) {
  if (typeof str === 'string') {
    try {
      const obj = JSON.parse(str);
      if (typeof obj === 'object' && obj) {
        return true;
      } else {
        return false;
      }
    } catch (e) {
      return false;
    }
  }
}

/**
   * encode Search Params
   */
function encodeSearchParams (obj) {
  const params = [];
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    params.push([key, encodeURIComponent(value)].join('='));
  });
  return params.length === 0 ? '' : '?' + params.join('&');
}
