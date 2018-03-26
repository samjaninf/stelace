/* global moment */

(function () {

    angular
        .module("app.inbox")
        .controller("CtaBoxController", CtaBoxController);

    function CtaBoxController($q,
                                $rootScope,
                                $scope,
                                $timeout,
                                $translate,
                                BookingService,
                                cache,
                                ContentService,
                                finance,
                                KycService,
                                ListingTypeService,
                                LocationService,
                                map,
                                Restangular,
                                pricing,
                                StelaceConfig,
                                toastr,
                                tools,
                                uiGmapGoogleMapApi,
                                UserService,
                                usSpinnerService) {
        var listeners         = [];
        var newAddress;
        var loadIBANForm;
        var kyc;
        var bankAccounts;
        var paymentAccounts;

        var vm = this;
        vm.listingTypeProperties = null;
        vm.missingAddress        = false;
        vm.badIban               = false;
        vm.isGoogleMapSDKReady   = cache.get("isGoogleMapSDKReady") || false;
        vm.currentUser           = null;
        vm.mainLocation          = null;
        vm.bankAccount           = null;
        vm.showBankAccountForm   = false;
        vm.bankAccountActive     = false;
        vm.showBankAccountToggle = false;
        vm.showContract          = false;
        vm.contractUrl           = null;
        vm.contractTarget        = "_blank";
        vm.listingType           = null;
        vm.listingTypeProperties = {};
        vm.adultPaymentTooltip = $translate.instant('pages.booking_payment.only_adult_payment_label');

        // Google Places ngAutocomplete options
        vm.ngAutocompleteOptions = {
            forceGlobalSearch: true
        };

        vm.onChangeBirthday = onChangeBirthday;
        vm.reveal            = reveal;
        vm.accept            = accept;
        vm.afterAccept       = afterAccept;
        vm.afterReject       = afterReject;
        vm.afterMessage      = afterMessage;
        vm.createBankAccount = createBankAccount;



        activate();

        function activate() {
            $translate('booking.acceptance_deadline_message')
                .then(function (message) {
                    vm.acceptanceDeadlineMessage = message;
                });

            // conversation bookingStatus is more accurate since updated
            vm.ctaTitleKey = _getCtaTitleKey((vm.conversation && vm.conversation.bookingStatus) || vm.message.bookingStatus);

            vm.paymentProvider = StelaceConfig.getPaymentProvider();

            // no booking if booking status is 'info'
            if (vm.booking) {
                vm.booking = Restangular.restangularizeElement(null, vm.booking, "booking");

                vm.listingTypeProperties = ListingTypeService.getProperties(vm.booking.listingType);

                if (vm.booking.startDate) {
                    vm.displayStartDate = vm.booking.startDate;
                }
                if (vm.booking.endDate) {
                    vm.displayEndDate = _getDisplayEndDate(vm.booking.endDate);
                }

                var config = vm.booking.listingType.config;

                if (config.hasBookingContract) {
                    // get contract url
                    vm.booking
                        .getContractToken()
                        .then(function (res) {
                            vm.contractUrl = BookingService.getContractUrl(vm.booking.id, res.value);
                            vm.contractTarget = "sip-booking-contract_" + vm.booking.id;
                            vm.showContract = vm.message.isCtaActive;
                        });
                }

                _setBookingState();
                _setFees();
            }

            vm.validateCollapse = true; // deprecated
            vm.rejectCollapse   = true;

            loadIBANForm = vm.isOwner && vm.booking.takerPrice;

            if (loadIBANForm) {
                $q.all({
                    currentUser: UserService.getCurrentUser(),
                    myLocations: LocationService.getMine(true),
                    uiGmapGoogleMapApi: uiGmapGoogleMapApi,
                    kyc: KycService.getMine(),
                    bankAccounts: finance.getBankAccounts(),
                    paymentAccounts: UserService.getPaymentAccounts(),
                }).then(function (results) {
                    vm.isGoogleMapSDKReady = true;
                    cache.set("isGoogleMapSDKReady", true);
                    kyc = results.kyc;
                    bankAccounts = results.bankAccounts;
                    paymentAccounts = results.paymentAccounts;

                    vm.currentUser  = results.currentUser;
                    vm.myLocations = results.myLocations;

                    if (vm.currentUser.address) {
                        vm.addressInput = vm.currentUser.address.name;
                    }

                    vm.identity = {
                        birthday: kyc.data.birthday,
                        nationality: kyc.data.nationality || "FR",
                        countryOfResidence: kyc.data.countryOfResidence || "FR"
                    };

                    // Populate account form
                    vm.firstName          = vm.currentUser.firstname;
                    vm.lastName           = vm.currentUser.lastname;
                    vm.hasBankAccount     = !!bankAccounts[0];
                    vm.bankAccount        = bankAccounts[0];
                    vm.bankAccountMissing = loadIBANForm && ! vm.hasBankAccount;

                    if (vm.bankAccount) {
                        vm.iban = vm.bankAccount.data.iban;
                    }

                    vm.showBankAccountForm = true;

                    // For now, bank account user editing is not possible
                    // Prompt user to contact our team for bank info editing only after accepting
                    vm.showBankAccountToggle = vm.hasBankAccount && !! vm.booking.acceptedDate;
                    vm.bankAccountActive     = ! vm.hasBankAccount && !! vm.booking.acceptedDate;
                });
            }

            listeners.push(
                $rootScope.$on("refreshInbox", function () {
                    _setBookingState();
                })
            );

            $scope.$on("$destroy", function () {
                _.forEach(listeners, function (listener) {
                    listener();
                });
            });

            $scope.$watch("vm.addressLocation", function (newLocation) {
                if (! newLocation || typeof newLocation !== "object") { // second condition returns false if object or null !
                    return;
                }

                map.getGooglePlaceData(newLocation)
                    .then(function (place) {
                        newAddress = place;
                    });
            });

            $scope.$watch("vm.hasBankAccount", function (newStatus, oldStatus) {
                if (oldStatus === false && newStatus === true) {
                    vm.bankAccountActive  = false;
                    vm.bankAccountMissing = false; // (loadIBANForm && ! vm.hasBankAccount)
                }
            });

        }

        function reveal(type) {
            var timeoutDuration = (vm.validateCollapse && vm.rejectCollapse ? 0 : 300);

            if (type === "validate" && vm.validateCollapse) {
                vm.rejectCollapse = true;
                $timeout(function () {
                    vm.validateCollapse = false;
                }, timeoutDuration);
            } else if (type === "reject" && vm.rejectCollapse) {
                vm.validateCollapse = true;
                $timeout(function () {
                    vm.rejectCollapse = false;
                }, timeoutDuration);
            } else if (type === "none") {
                vm.validateCollapse = true;
                vm.rejectCollapse = true;
            }
        }

        function accept() {
            if (vm.currentRequest) { // debounce
                return;
            }
            vm.currentRequest = true;

            usSpinnerService.spin('booking-validation-spinner');
            // error messages handled in the function
            vm.onAccept(vm.ctaAnswerMessage, vm.booking, vm.afterAccept);
        }

        function afterAccept(param) {
            _setBookingState();
            usSpinnerService.stop('booking-validation-spinner');
            vm.currentRequest = false;
            if (param === "missingMessage") {
                vm.missingCtaAnswerMessage = true;
            } else {
                vm.missingCtaAnswerMessage = false;
                // Allow user to contact our team only after accepting to edit bank account info
                vm.showBankAccountToggle = vm.hasBankAccount;
                vm.bankAccountActive     = ! vm.hasBankAccount;
            }
        }

        function afterReject(param) {
            _setBookingState();
            usSpinnerService.stop('booking-validation-spinner');
            vm.currentRequest = false;
            if (param === "missingMessage") {
                vm.missingCtaAnswerMessage = true;
            } else {
                vm.missingCtaAnswerMessage = false;
            }
        }

        function afterMessage(param) {
            usSpinnerService.stop('booking-validation-spinner');
            vm.currentRequest = false;
            if (param === "missingMessage") {
                vm.missingCtaAnswerMessage = true;
            } else {
                vm.missingCtaAnswerMessage = false;
                vm.ctaAnswerMessage        = null;
                vm.ctaPublicMessage        = null;
            }
        }

        function onChangeBirthday(date) {
            vm.identity.birthday = date;
        }

        function createBankAccount() {
            var editingCurrentUser = Restangular.copy(vm.currentUser);

            if (vm.currentRequest) { // debounce
                return;
            }

            var isCompleteMangopay = paymentAccounts.mangopayAccount && paymentAccounts.mangopayWallet;
            var isCompleteStripe = paymentAccounts.stripeAccount;
            var isComplete = (vm.paymentProvider === 'mangopay' && isCompleteMangopay)
                || (vm.paymentProvider === 'stripe' && isCompleteStripe);

            // Check if all needed info was provider for bank account
            if (!isComplete) {
                if (! vm.identity.birthday
                 || ! vm.identity.nationality
                 || ! vm.identity.countryOfResidence
                 || ! vm.firstName
                 || ! vm.lastName
                ) {
                    ContentService.showNotification({
                        messageKey: 'inbox.banking_details.notification.missing_information_message',
                        type: 'warning'
                    });
                    vm.currentRequest = false;
                    return;
                }
            }

            editingCurrentUser.firstname = vm.firstName;
            editingCurrentUser.lastname  = vm.lastName;

            return $q.when(true)
                .then(function () {
                    usSpinnerService.spin('booking-validation-spinner');

                    var updateAttrs = [
                        "firstname",
                        "lastname",
                        "userType",
                    ];

                    editingCurrentUser.userType = editingCurrentUser.userType || 'individual'; // TODO: the user can choose from UI

                    if (! _.isEqual(_.pick(editingCurrentUser, updateAttrs), _.pick(vm.currentUser, updateAttrs))) {
                        return editingCurrentUser.patch();
                    }

                    return;
                })
                .then(function () {
                    var updatingAddress = null;
                    var missingAddress  = false;

                    if (newAddress) {
                        updatingAddress = newAddress;
                    } else if (! vm.currentUser.address) {
                        missingAddress = true;
                    }

                    if (missingAddress) {
                        vm.missingAddress = true;
                    } else {
                        vm.missingAddress = false;
                    }

                    if (updatingAddress) {
                        return editingCurrentUser
                            .updateAddress(updatingAddress)
                            .then(function () {
                                newAddress = null;
                                vm.currentUser.address = updatingAddress;

                                // if the user has no locations, add it
                                if (! vm.myLocations.length) {
                                    // no error handling
                                    LocationService
                                        .post(_.omit(updatingAddress, ["id"]))
                                        .then(function (newLocation) {
                                            LocationService.add(newLocation);
                                            vm.myLocations.push(newLocation);
                                        });
                                }
                            })
                            .catch(function (err) {
                                ContentService.showNotification({
                                    messageKey: 'inbox.banking_details.notification.incorrect_location_message',
                                    type: 'warning'
                                });
                                return $q.reject(err);
                            });
                    } else if (missingAddress) {
                        ContentService.showNotification({
                            messageKey: 'inbox.banking_details.notification.missing_location_message',
                            type: 'warning'
                        });
                        return $q.reject("no address");
                    } else {
                        return;
                    }
                })
                .then(function () {
                    if (isComplete) {
                        return true;
                    }

                    return KycService.updateKyc(kyc, {
                        birthday: vm.identity.birthday,
                        nationality: vm.identity.nationality,
                        countryOfResidence: vm.identity.countryOfResidence
                    })
                    .then(function (newKyc) {
                        kyc = newKyc;

                        if (vm.paymentProvider === 'mangopay') {
                            return finance.createAccount();
                        } else if (vm.paymentProvider === 'stripe') {
                            return finance.createStripeAccountToken({
                                legal_entity: {
                                    first_name: vm.currentUser.firstname,
                                    last_name: vm.currentUser.lastname,
                                    address: {
                                        line1: vm.currentUser.address.name,
                                        city: vm.currentUser.address.city,
                                        state: vm.currentUser.address.region,
                                        postal_code: vm.currentUser.address.postalCode,
                                    },
                                },
                                tos_shown_and_accepted: true
                            })
                            .then(function (res) {
                                return finance.createAccount({
                                    accountToken: res.token.id,
                                    accountType: 'account',
                                    country: kyc.data.countryOfResidence, // TODO: check the country associated with RIB
                                });
                            });
                        }
                    })
                    .catch(function (err) {
                        ContentService.showError(err);
                        return $q.reject(err);
                    });
                })
                .then(function () {
                    if (vm.hasBankAccount) {
                        return ContentService.showSaved();
                    }

                    if (! vm.iban) {
                        ContentService.showNotification({
                            messageKey: 'inbox.banking_details.notification.missing_iban_message',
                            type: 'warning'
                        });
                        vm.badIban = true;
                        return $q.reject("no iban");
                    }

                    if (vm.paymentProvider === 'mangopay') {
                        var createBankAccountAttrs = {
                            ownerName: vm.firstName + " " + vm.lastName,
                            ownerAddress: {
                                AddressLine1: vm.currentUser.address.name,
                                City: vm.currentUser.address.city,
                                PostalCode: vm.currentUser.address.postalCode,
                                Country: vm.identity.countryOfResidence, // TODO: get the country from the address
                            },
                            iban: vm.iban,
                        };

                        return finance.createBankAccount(createBankAccountAttrs)
                            .then(_afterBankAccountCreationSuccess)
                            .catch(_afterBankAccountCreationFail);
                    } else if (vm.paymentProvider === 'stripe') {
                        return finance.createStripeBankAccountToken({
                            country: vm.identity.countryOfResidence,
                            currency: 'eur', // handle other currencies
                            routing_number: undefined,
                            account_number: vm.iban,
                            account_holder_name: vm.firstName + " " + vm.lastName,
                            account_holder_type: vm.currentUser.userType
                        })
                        .then(function (res) {
                            return finance.createBankAccount({
                                accountToken: res.token.id
                            });
                        })
                        .then(_afterBankAccountCreationSuccess)
                        .catch(_afterBankAccountCreationFail);
                    }
                })
                .finally(function () {
                    usSpinnerService.stop('booking-validation-spinner');
                    vm.currentRequest = false;
                });
        }

        function _afterBankAccountCreationSuccess() {
            vm.hasBankAccount        = true;
            vm.bankAccountActive     = false;
            vm.showBankAccountToggle = true;
            vm.ctaTitleKey = _getCtaTitleKey();

            ContentService.showNotification({
                titleKey: 'inbox.banking_details.notification.success_title',
                messageKey: 'inbox.banking_details.notification.success_message',
                type: 'success'
            });
        }

        function _afterBankAccountCreationFail(err) {
            ContentService.showNotification({
                messageKey: 'inbox.banking_details.notification.iban_error_message',
                type: 'warning'
            });
            vm.badIban = true;
            return $q.reject(err);
        }

        function _setBookingState() {
            if (! vm.booking) {
                return;
            }

            if (vm.booking.cancellationId) {
                vm.bookingState = "cancelled";
            } else if (! vm.message.isCtaActive) {
                vm.bookingState = "updated";
            } else if (vm.booking.acceptedDate && vm.booking.paidDate) {
                vm.bookingState = "paidAndValidated";
            } else if (vm.booking.paidDate) {
                vm.bookingState = "paid";
            } else if (vm.booking.acceptedDate) {
                vm.bookingState = "validated";
            }
        }

        function _getCtaTitleKey(bookingStatus) {
            var needPaymentDetails = vm.booking && vm.booking.acceptedDate && vm.isOwner && ! vm.hasBankAccount;
            if (needPaymentDetails) {
                return 'booking.summary_title.information_required';
            }

            switch (bookingStatus) {
                case "info":
                case "pre-booking":
                    return 'booking.summary_title.request_for_information';

                default:
                    return 'booking.summary_title.booking_request';
            }
        }

        function _setFees() {
            var priceResult = pricing.getPriceAfterRebateAndFees({ booking: vm.booking });

            vm.listingBasePrice = priceResult.ownerPriceAfterRebate;
            vm.ownerNetIncome  = priceResult.ownerNetIncome;
        }

        function _getDisplayEndDate(date) {
            return moment(date).add({ d: -1 }).format('YYYY-MM-DD') + 'T00:00:00.000Z';
        }
    }

})();
