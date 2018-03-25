(function () {

    angular
        .module("app.bookings")
        .config(configBlock);

    function configBlock($stateProvider) {
        var appsPath = "/assets/app/apps";
        var appClassName = "booking";

        $stateProvider
            .state("bookingPayment", {
                url: "/checkout/:id",
                templateUrl: appsPath + "/bookings/booking-payment.html",
                controller: "BookingPaymentController",
                controllerAs: "vm",
                appClassName: appClassName,
                title: "pages.booking_payment.page_title"
            })
            .state("bookingConfirmation", {
                url: "/confirmation/:id",
                templateUrl: appsPath + "/bookings/booking-confirmation.html",
                controller: "BookingConfirmationController",
                controllerAs: "vm",
                appClassName: appClassName,
                title: "pages.booking_confirmation.page_title"
            });
    }

})();
