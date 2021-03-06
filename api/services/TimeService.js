module.exports = {

    isDate,
    isDateString,
    isPureDate,
    getPureDate,
    isIntersection,
    getPeriodLimits,
    convertTimestampSecToISO,
    getMonthWeekDays,
    isValidCronPattern,
    parseCronPattern,
    convertToCronPattern,
    forceCronPattern,
    computeRecurringDates,

};

const moment = require('moment');
const _ = require('lodash');
const CronConverter = require('cron-converter');

/**
 * Check if the provided date is an instance of Date and a valid date
 * @param  {Date}  date
 * @return {Boolean}
 */
function isDate(date) {
    return typeof date === 'object' && date.getTime && !isNaN(date.getTime());
}

/**
 * Check if the provided value is UTC-format date string
 * @param  {String}  value
 * @param  {Object}  [options]
 * @param  {Boolean} [options.onlyDate = false]
 * @return {Boolean}
 */
function isDateString(value, { onlyDate = false } = {}) {
    if (typeof value !== 'string') return false;

    let regex;

    if (onlyDate) {
        regex = /^\d{4}-\d{2}-\d{2}$/;
    } else {
        regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
    }

    if (!regex.test(value)) return false;

    const date = new Date(value);
    return isDate(date);
}

/**
 * Check if the date has 0 unit below days (0 hour, 0 minute, 0 second, 0 millisecond)
 * If true, that means the date is probably an automated date (not created by user)
 * @param  {String|Object}  date
 * @return {Boolean}
 */
function isPureDate(date) {
    if (!isDateString(date) && !isDate(date)) {
        throw new Error('Expected a valid date');
    }

    return date.slice(11) === '00:00:00.000Z';
}

function getPureDate(date) {
    if (!isDateString(date) && !isDate(date)) {
        throw new Error('Expected a valid date');
    }

    const m = moment(date);
    return m.format('YYYY-MM-DD') + 'T00:00:00.000Z';
}

function isIntersection(array, value) {
    return _.reduce(array, function (memo, element) {
        if (value.endDate <= element.startDate || element.endDate <= value.startDate) {
            return memo;
        } else {
            return memo || true;
        }
    }, false);
}

/**
 * get period limits
 * @param  {string} date
 * @param  {object} duration    moment duration object
 * @param  {string} [type]      define the period behavior
 * @return {object}
 */
function getPeriodLimits(date, duration, type) {
    var min;
    var max;

    if (type === "before") {
        min = moment(date).subtract(duration).toISOString();
        max = date;
    } else if (type === "after") {
        min = date;
        max = moment(date).add(duration).toISOString();
    } else { // type === "center"
        var halfDuration = _.reduce(duration, (memo, value, key) => {
            memo[key] = value / 2;
            return memo;
        }, {});

        min = moment(date).subtract(halfDuration).toISOString();
        max = moment(date).add(halfDuration).toISOString();
    }

    return {
        min: min,
        max: max
    };
}

function convertTimestampSecToISO(timestampSec) {
    return moment(new Date(parseInt(timestampSec + '000', 10))).toISOString();
}

function getMonthWeekDays(weekDayNum, year, month) {
    var formatDate = "YYYY-MM-DD";

    var date      = moment().year(year).month(month - 1).startOf("month");
    var limitDate = moment(date).add(1, "M").format(formatDate);

    date.isoWeekday(weekDayNum);

    var weekDays = [];
    var dateStr = date.format(formatDate);

    while (dateStr < limitDate) {
        if (date.month() + 1 === month) {
            weekDays.push(dateStr);
        }
        date.add(7, "d");
        dateStr = date.format(formatDate);
    }

    return weekDays;
}

function isValidCronPattern(pattern) {
    const cronInstance = new CronConverter();
    try {
        cronInstance.fromString(pattern);
        return true;
    } catch (e) {
        return false;
    }
}

function parseCronPattern(pattern) {
    const cronInstance = new CronConverter();

    cronInstance.fromString(pattern);
    const array = cronInstance.toArray();

    return {
        minute: array[0],
        hour: array[1],
        dayOfMonth: array[2],
        month: array[3],
        dayOfWeek: array[4],
    };
}

function convertToCronPattern(cronObj) {
    const cronInstance = new CronConverter();

    const array = [
        cronObj.minute,
        cronObj.hour,
        cronObj.dayOfMonth,
        cronObj.month,
        cronObj.dayOfWeek,
    ];

    return cronInstance.fromArray(array).toString();
}

/**
 * Force the cron pattern to not trigger below the provided time unit
 * e.g. if the time unit is day, do not trigger every minute or every hour
 * @param {String} pattern
 * @param {String} timeUnit - 'm', 'h', 'd'
 */
function forceCronPattern(pattern, timeUnit) {
    if (!_.includes(['m', 'h', 'd'], timeUnit)) {
        throw new Error('Invalid time unit');
    }

    if (timeUnit === 'm') {
        return pattern;
    }

    const parsed = parseCronPattern(pattern);

    if (timeUnit === 'h') {
        parsed.minute = [0];
    } else if (timeUnit === 'd') {
        parsed.minute = [0];
        parsed.hour = [0];
    }

    return convertToCronPattern(parsed);
}

/**
 * @param {String} pattern
 * @param {Object} attrs
 * @param {String} attrs.startDate - inclusive
 * @param {String} attrs.endDate - exclusive
 * @param {String} [attrs.onlyPureDate = false] - returns date with 0 hours 0 minutes 0 seconds
 * @param {String[]} dates
 */
function computeRecurringDates(pattern, { startDate, endDate, onlyPureDate = false } = {}) {
    if (!isDateString(startDate) || !isDateString(endDate)) {
        throw new Error('Expected start and end dates');
    }
    if (endDate < startDate) {
        throw new Error('Invalid dates');
    }

    const cronInstance = new CronConverter({
        timezone: 'Europe/London', // Greenwich timezone
    });
    cronInstance.fromString(pattern);

    const schedule = cronInstance.schedule(startDate);

    let continueLoop = true;
    const dates = [];

    while (continueLoop) {
        const momentDate = schedule.next();

        let date;
        if (onlyPureDate) {
            date = momentDate.format('YYYY-MM-DD') + 'T00:00:00.000Z';
        } else {
            date = momentDate.toISOString();
        }

        continueLoop = date < endDate;

        if (continueLoop) {
            dates.push(date);
        }
    }

    return dates;
}
